import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, Mail, ChevronRight, Check } from "lucide-react";
import xaneIcon from "@/assets/xane-icon.png";
import {
  checkXaneTag,
  displayTag,
  getReferralPreview,
  isAlreadyRegistered,
  joinWaitlist,
  normalizeTag,
  requestOtp,
  verifyOtp,
} from "@/lib/waitlistApi";

export interface WaitlistFormData {
  fullName: string;
  phone?: string;
  email: string;
  freeTag: string;
  premiumTag: string;
  userId: string;
  telegramDeepLink: string;
}

interface WaitlistFormProps {
  onSubmitSuccess: (data: WaitlistFormData) => void;
  /** An existing member signs in with an email code instead of joining again. */
  onSignIn?: (email?: string) => void;
}

type TagState =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid"
  | "error";

const WaitlistForm: React.FC<WaitlistFormProps> = ({ onSubmitSuccess, onSignIn }) => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [freeTag, setFreeTag] = useState("");
  const [premiumTag, setPremiumTag] = useState("");
  const [tagType, setTagType] = useState<"free" | "premium" | null>(null);

  // Email verification state
  const [emailOtpState, setEmailOtpState] = useState<
    "idle" | "otp-sent" | "verifying" | "verified" | "error"
  >("idle");
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [emailResendTimer, setEmailResendTimer] = useState(0);
  const [emailError, setEmailError] = useState("");
  // The email is already on the waitlist: offer sign-in rather than a dead end.
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [referrerIsTag, setReferrerIsTag] = useState(true);

  const [freeTagState, setFreeTagState] = useState<TagState>("idle");
  const [referrerTag, setReferrerTag] = useState("");
  const [premiumTagState, setPremiumTagState] = useState<TagState>("idle");
  const [tagMessage, setTagMessage] = useState("");
  const [premiumMessage, setPremiumMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const referralCode =
    new URLSearchParams(window.location.search).get("ref") || undefined;
  const normalizedFreeTag = normalizeTag(freeTag);
  const normalizedPremiumTag = normalizeTag(premiumTag);
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  // Email OTP Resend Countdown
  useEffect(() => {
    if (emailResendTimer <= 0) return;
    const interval = window.setInterval(() => {
      setEmailResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [emailResendTimer]);

  // Free Tag Availability Check
  useEffect(() => {
    if (tagType !== "free") return;
    if (normalizedFreeTag.length < 3) {
      setFreeTagState("idle");
      setTagMessage("");
      return;
    }
    if (!/^[a-z0-9_]{5,20}$/.test(normalizedFreeTag)) {
      setFreeTagState("invalid");
      setTagMessage("5–20 characters. Must contain letters and numbers or underscores.");
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setFreeTagState("checking");
      try {
        const result = await checkXaneTag(normalizedFreeTag, "free");
        if (cancelled) return;
        setFreeTagState(result.available ? "available" : "taken");
        setTagMessage(
          result.available ? "Available ✓" : result.reason || "Already taken."
        );
      } catch (error) {
        if (cancelled) return;
        setFreeTagState("error");
        setTagMessage(
          error instanceof Error ? error.message : "Could not check XaneTag."
        );
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedFreeTag, tagType]);

  // Premium Tag Availability Check
  useEffect(() => {
    if (tagType !== "premium") return;
    if (!normalizedPremiumTag) {
      setPremiumTagState("idle");
      setPremiumMessage("");
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(normalizedPremiumTag)) {
      setPremiumTagState("invalid");
      setPremiumMessage("3–20 characters. Only your name, no special characters.");
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPremiumTagState("checking");
      try {
        const result = await checkXaneTag(normalizedPremiumTag, "premium");
        if (cancelled) return;
        setPremiumTagState(result.available ? "available" : "taken");
        setPremiumMessage(
          result.available ? "Available ✓" : result.reason || "Already taken."
        );
      } catch (error) {
        if (cancelled) return;
        setPremiumTagState("error");
        setPremiumMessage(
          error instanceof Error
            ? error.message
            : "Could not check Premium XaneTag."
        );
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedPremiumTag, tagType]);

  // Referral preview
  useEffect(() => {
    if (!referralCode) {
      setReferrerTag("");
      return;
    }

    let cancelled = false;

    const loadReferralPreview = async () => {
      try {
        const result = await getReferralPreview(referralCode);
        if (!cancelled) {
          // A referrer whose reservation expired holds no tag: show their first name.
          setReferrerTag(result.referrerTag || result.referrerName || "");
          setReferrerIsTag(Boolean(result.referrerTag));
        }
      } catch {
        if (!cancelled) {
          setReferrerTag("");
        }
      }
    };

    loadReferralPreview();

    return () => {
      cancelled = true;
    };
  }, [referralCode]);


  const handleEmailChange = (value: string) => {
    setEmail(value.trimStart());
    setEmailOtpState("idle");
    setEmailOtpCode("");
    setEmailError("");
    setFormError("");
    setAlreadyMember(false);
  };

  const handleSendEmailOtp = async () => {
    if (!validEmail) return;
    setEmailError("");
    setFormError("");
    setEmailOtpState("verifying");

    try {
      const result = await requestOtp(email.trim().toLowerCase(), "email");
      if (result.bypassed || result.verified) {
        setEmailOtpState("verified");
        setEmailOtpCode("");
        return;
      }
      setEmailOtpState("otp-sent");
      setEmailResendTimer(result.resendAfterSeconds || 60);
    } catch (error) {
      setEmailOtpState("error");
      if (isAlreadyRegistered(error)) {
        setAlreadyMember(true);
        setEmailError("This email is already on the waitlist.");
        return;
      }
      setEmailError(
        error instanceof Error ? error.message : "Could not send verification code to your email."
      );
    }
  };

  const handleVerifyEmailOtp = async (code: string) => {
    setEmailOtpCode(code);
    if (code.length !== 6) return;

    setEmailOtpState("verifying");
    setEmailError("");

    try {
      await verifyOtp(email.trim().toLowerCase(), "email", code);
      setEmailOtpState("verified");
      setEmailOtpCode("");
    } catch (error) {
      setEmailOtpState("error");
      setEmailError(
        error instanceof Error ? error.message : "Incorrect or expired verification code."
      );
    }
  };

  const handleFreeTagChange = (value: string) => {
    setFreeTag(
      value
        .replace(/^@/, "")
        .replace(/\.xane$/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 20)
    );
  };

  const handlePremiumTagChange = (value: string) => {
    setPremiumTag(
      value
        .replace(/^@/, "")
        .replace(/\.xane$/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 20)
    );
  };

  const selectedTagValid =
    tagType === "free"
      ? freeTagState === "available"
      : tagType === "premium"
      ? premiumTagState === "available"
      : false;

  const isFormValid =
    fullName.trim().length >= 2 &&
    validEmail &&
    emailOtpState === "verified" &&
    tagType !== null &&
    selectedTagValid;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setFormError("");

    try {
      const result = await joinWaitlist({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        xaneTag: tagType === "free" ? normalizedFreeTag : undefined,
        premiumXaneTag: tagType === "premium" ? normalizedPremiumTag : undefined,
        referralCode,
      });

      onSubmitSuccess({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        freeTag: displayTag(result.xaneTag || (tagType === "free" ? normalizedFreeTag : "")),
        premiumTag: displayTag(tagType === "premium" ? normalizedPremiumTag : ""),
        userId: result.userId,
        telegramDeepLink: result.telegramDeepLink,
      });
    } catch (error) {
      if (isAlreadyRegistered(error)) setAlreadyMember(true);
      setFormError(
        error instanceof Error ? error.message : "Could not join the waitlist."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-4 py-8 sm:py-12">
      {/* Title & Subtitle */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <h1 className="font-sans text-[34px] sm:text-[46px] md:text-[54px] font-black tracking-tight text-white leading-tight">
          Join the Xane Waitlist.
        </h1>
        <p className="mt-2.5 text-base sm:text-lg md:text-xl font-medium text-white/90">
          Get early access, reserve your XaneTag before launch.
        </p>
      </motion.div>

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="mt-8 sm:mt-10 w-full rounded-[32px] bg-white p-6 sm:p-8 md:p-11 shadow-2xl text-[#111111]"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* 1. Full Name */}
          <div className="space-y-1.5 text-left">
            <label className="text-xs font-black tracking-wider text-[#111111] uppercase">
              FULL NAME
            </label>
            <div className="relative flex items-center rounded-[16px] border border-[#0047FF] bg-white">
              <User
                size={18}
                className="pointer-events-none absolute left-4 text-[#111111]"
              />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g your name"
                className="w-full rounded-[16px] bg-transparent py-3.5 pl-12 pr-4 text-sm sm:text-base font-medium outline-none placeholder:text-gray-400 focus:ring-4 focus:ring-[#0047FF]/10"
              />
            </div>
          </div>

          {/* 2. Email Address Field */}
          <div className="space-y-1.5 text-left">
            <label className="text-xs font-black tracking-wider text-[#111111] uppercase">
              EMAIL ADDRESS
            </label>

            <div className="relative flex items-center rounded-[16px] border border-[#0047FF] bg-white">
              <Mail
                size={18}
                className="pointer-events-none absolute left-4 text-[#111111]"
              />
              <input
                type="email"
                required
                disabled={emailOtpState === "verifying"}
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                placeholder="e.g your@mail.com"
                className="w-full rounded-[16px] bg-transparent py-3.5 pl-12 pr-24 text-sm sm:text-base font-medium outline-none placeholder:text-gray-400 focus:ring-4 focus:ring-[#0047FF]/10 disabled:opacity-70"
              />

              {/* Verifying Status */}
              {emailOtpState === "verifying" && (
                <span className="absolute right-3.5 text-xs font-bold text-[#0047FF] animate-pulse">
                  Verifying...
                </span>
              )}

              {/* Verify button: Shown ONLY when NOT verified and NOT verifying */}
              {emailOtpState !== "verified" && emailOtpState !== "verifying" && (
                <button
                  type="button"
                  disabled={!validEmail || emailOtpState === "otp-sent"}
                  onClick={handleSendEmailOtp}
                  className="absolute right-2.5 rounded-full bg-[#0047FF] px-4 py-1.5 text-xs font-bold text-white transition-all hover:bg-[#0036CC] active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 cursor-pointer disabled:cursor-not-allowed shadow-xs"
                >
                  Verify
                </button>
              )}

              {/* When VERIFIED: The Verify button is completely removed! Show Verified check badge */}
              {emailOtpState === "verified" && (
                <div className="absolute right-3.5 flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600">
                  <Check size={14} strokeWidth={2.8} />
                  <span>Verified</span>
                </div>
              )}
            </div>

            {/* Inline OTP Code input if Email OTP sent */}
            {emailOtpState === "otp-sent" && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 flex items-center justify-between rounded-[14px] border border-[#0047FF]/40 bg-[#F0F5FF] px-3.5 py-2.5 text-xs"
              >
                <input
                  type="text"
                  maxLength={6}
                  value={emailOtpCode}
                  onChange={(e) => handleVerifyEmailOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 6-digit OTP from email"
                  className="w-48 bg-transparent font-bold tracking-widest text-[#111111] outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400 text-xs sm:text-sm"
                  autoFocus
                />
                <button
                  type="button"
                  disabled={emailResendTimer > 0}
                  onClick={handleSendEmailOtp}
                  className="text-xs font-bold text-[#0047FF] hover:underline disabled:text-gray-400 cursor-pointer disabled:cursor-not-allowed"
                >
                  {emailResendTimer > 0 ? `Resend (${emailResendTimer}s)` : "Resend"}
                </button>
              </motion.div>
            )}

            {emailError && (
              <p className="mt-1 text-xs font-semibold text-red-500">
                {emailError}
                {alreadyMember && onSignIn && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => onSignIn(email.trim().toLowerCase())}
                      className="font-bold text-[#0047FF] underline"
                    >
                      Sign in to your dashboard
                    </button>
                  </>
                )}
              </p>
            )}
          </div>

          {/* 3. Choose your XaneTag option */}
          <div className="space-y-2 text-left">
            <label className="text-xs font-semibold text-gray-800">
              Choose your XaneTag option
            </label>

            {/* Outer Container for option cards */}
            <div className="rounded-[18px] border border-gray-200/80 bg-[#FAFAFA] p-2.5 sm:p-3 shadow-xs">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                
                {/* Free XaneTag Option Card */}
                <div
                  onClick={() => setTagType("free")}
                  className={`flex cursor-pointer items-center justify-between rounded-[14px] p-3 sm:p-3.5 transition-all ${
                    tagType === "free"
                      ? "border-2 border-[#0047FF] bg-white shadow-sm"
                      : "border border-[#0047FF] bg-white hover:border-2"
                  }`}
                >
                  <div className="flex flex-col text-left pr-2">
                    <span className="text-xs sm:text-sm font-black tracking-wider uppercase text-[#111111]">
                      FREE XANETAG
                    </span>
                    <span className="text-[9px] sm:text-[10px] text-gray-500 leading-tight mt-0.5">
                      Must contain letters and numbers or underscores.
                    </span>
                  </div>

                  {/* Radio Indicator */}
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[#0047FF] shrink-0">
                    {tagType === "free" ? (
                      <div className="h-2.5 w-2.5 rounded-full bg-[#0047FF]" />
                    ) : (
                      <div className="h-1.5 w-1.5 rounded-full border border-[#0047FF]/50" />
                    )}
                  </div>
                </div>

                {/* Premium XaneTag Option Card */}
                <div
                  onClick={() => setTagType("premium")}
                  className={`flex cursor-pointer items-center justify-between rounded-[14px] p-3 sm:p-3.5 transition-all ${
                    tagType === "premium"
                      ? "border-2 border-[#0047FF] bg-white shadow-sm"
                      : "border border-[#0047FF] bg-white hover:border-2"
                  }`}
                >
                  <div className="flex flex-col text-left pr-2">
                    <span className="text-xs sm:text-sm font-black tracking-wider uppercase text-[#0047FF]">
                      PREMIUM XANETAG
                    </span>
                    <span className="text-[9px] sm:text-[10px] text-gray-500 leading-tight mt-0.5">
                      Only your name, no special characters.
                    </span>
                  </div>

                  {/* Radio Indicator */}
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[#0047FF] shrink-0">
                    {tagType === "premium" ? (
                      <div className="h-2.5 w-2.5 rounded-full bg-[#0047FF]" />
                    ) : (
                      <div className="h-1.5 w-1.5 rounded-full border border-[#0047FF]/50" />
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* 4. Dynamic XaneTag Input (shown below the option box) */}
          {tagType === "free" && (
            <div className="space-y-1 text-left">
              <div className="relative flex items-center rounded-[16px] border border-[#0047FF] bg-white">
                <User
                  size={18}
                  className="pointer-events-none absolute left-3.5 text-[#111111]"
                />
                <input
                  type="text"
                  required
                  value={freeTag}
                  onChange={(e) => handleFreeTagChange(e.target.value)}
                  placeholder="e.g yourname_22.xane"
                  className="w-full rounded-[16px] bg-transparent py-3.5 pl-11 pr-4 text-xs sm:text-sm font-medium outline-none placeholder:text-gray-400 focus:ring-4 focus:ring-[#0047FF]/10"
                />
              </div>

              {/* Tag Validation Message */}
              {freeTagState !== "idle" && (
                <div className="flex items-center justify-between px-1 text-[10px]">
                  <span
                    className={
                      freeTagState === "available"
                        ? "font-semibold text-emerald-600"
                        : freeTagState === "taken" || freeTagState === "invalid"
                        ? "font-semibold text-red-500"
                        : "text-gray-400"
                    }
                  >
                    {freeTagState === "checking"
                      ? "Checking availability..."
                      : tagMessage}
                  </span>
                </div>
              )}
            </div>
          )}

          {tagType === "premium" && (
            <div className="space-y-1 text-left">
              <div className="relative flex items-center rounded-[16px] border border-[#0047FF] bg-white">
                <div className="pointer-events-none absolute left-3 flex h-5 w-5 items-center justify-center rounded-[4px] bg-[#0047FF] p-0.5 shadow-xs">
                  <img
                    src={xaneIcon}
                    alt="Xane"
                    className="h-full w-full object-contain brightness-0 invert"
                  />
                </div>
                <input
                  type="text"
                  required
                  value={premiumTag}
                  onChange={(e) => handlePremiumTagChange(e.target.value)}
                  placeholder="@yourname.xane"
                  className="w-full rounded-[16px] bg-transparent py-3.5 pl-11 pr-4 text-xs sm:text-sm font-medium outline-none placeholder:text-gray-400 focus:ring-4 focus:ring-[#0047FF]/10"
                />
              </div>

              {/* Premium Tag Validation Message with referral notice */}
              <div className="flex items-center justify-between px-1 text-[11px] sm:text-xs">
                <span className="text-gray-500 font-medium">
                  Refer 10 people in 14 days to own it.
                </span>
                {premiumTagState !== "idle" && (
                  <span
                    className={
                      premiumTagState === "available"
                        ? "font-semibold text-emerald-600"
                        : premiumTagState === "taken" || premiumTagState === "invalid"
                        ? "font-semibold text-red-500"
                        : "text-gray-400"
                    }
                  >
                    {premiumTagState === "checking"
                      ? "Checking availability..."
                      : premiumMessage}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Referral Notice */}
          {referralCode && referrerTag && (
            <p className="rounded-[12px] bg-blue-50 px-3 py-2 text-[11px] font-semibold text-[#0047FF] text-left">
              Welcome! 👋 You joined through{" "}
              <span className="font-bold">
                {referrerIsTag
                  ? `@${referrerTag.replace(/^@/, "").replace(/\.xane$/i, "")}.xane`
                  : referrerTag}
              </span>
              's referral.
            </p>
          )}

          {/* Form Error Banner */}
          {formError && (
            <div className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-600 text-left">
              {formError}
            </div>
          )}

          {/* 5. Submit Button */}
          <motion.button
            type="submit"
            whileHover={isFormValid ? { scale: 1.02 } : {}}
            whileTap={isFormValid ? { scale: 0.98 } : {}}
            disabled={!isFormValid || isSubmitting}
            className={`flex w-full items-center justify-center gap-2 rounded-full py-3.5 sm:py-4 text-sm sm:text-base font-bold transition-all shadow-md ${
              isFormValid
                ? "bg-[#0047FF] text-white hover:bg-[#0036CC] cursor-pointer shadow-lg active:scale-[0.98]"
                : "bg-gradient-to-r from-[#D0D3D9] via-[#C4C7CE] to-[#B8BBC2] text-white cursor-not-allowed opacity-90 shadow-xs"
            }`}
          >
            <span>{isSubmitting ? "Joining..." : "Join Waitlist"}</span>
            <div className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-white shadow-xs">
              <ChevronRight
                size={14}
                strokeWidth={2.8}
                className={isFormValid ? "text-[#0047FF]" : "text-[#A5A8AF]"}
              />
            </div>
          </motion.button>

          {/* 6. Social Proof */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <div className="flex -space-x-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#0047FF] text-[9px] font-bold text-white">
                D
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#00C853] text-[9px] font-bold text-white">
                S
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#FFB300] text-[9px] font-bold text-white">
                K
              </div>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-bold leading-tight text-[#111111]">
                Early users already in.
              </span>
              <span className="text-[10px] leading-tight text-gray-500">
                Join before public launch.
              </span>
            </div>
          </div>

          {onSignIn && (
            <p className="text-center text-xs font-medium text-gray-500">
              Already on the waitlist?{" "}
              <button
                type="button"
                onClick={() => onSignIn(validEmail ? email.trim().toLowerCase() : undefined)}
                className="font-bold text-[#0047FF] hover:underline"
              >
                Sign in
              </button>
            </p>
          )}

        </form>
      </motion.div>
    </div>
  );
};

export default WaitlistForm;
