import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, Mail, Phone, CheckCircle2, ArrowRight } from "lucide-react";
import xaneIcon from "@/assets/xane-icon.png";
import {
  checkXaneTag,
  displayTag,
  joinWaitlist,
  normalizePhone,
  normalizeTag,
  requestOtp,
  verifyOtp,
} from "@/lib/waitlistApi";

export interface WaitlistFormData {
  fullName: string;
  phone: string;
  email: string;
  freeTag: string;
  premiumTag: string;
  userId: string;
  telegramDeepLink: string;
}

interface WaitlistFormProps {
  onSubmitSuccess: (data: WaitlistFormData) => void;
}

type OtpState = "idle" | "otp-sent" | "verifying" | "verified" | "error";
type TagState = "idle" | "checking" | "available" | "taken" | "invalid" | "error";

const WaitlistForm: React.FC<WaitlistFormProps> = ({ onSubmitSuccess }) => {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [freeTag, setFreeTag] = useState("");
  const [premiumTag, setPremiumTag] = useState("");

  const [phoneOtpState, setPhoneOtpState] = useState<OtpState>("idle");
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [emailOtpState, setEmailOtpState] = useState<OtpState>("idle");
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [phoneResendTimer, setPhoneResendTimer] = useState(0);
  const [emailResendTimer, setEmailResendTimer] = useState(0);

  const [freeTagState, setFreeTagState] = useState<TagState>("idle");
  const [premiumTagState, setPremiumTagState] = useState<TagState>("idle");
  const [tagMessage, setTagMessage] = useState("");
  const [premiumMessage, setPremiumMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const referralCode = new URLSearchParams(window.location.search).get("ref") || undefined;
  const normalizedPhone = normalizePhone(phone);
  const normalizedFreeTag = normalizeTag(freeTag);
  const normalizedPremiumTag = normalizeTag(premiumTag);
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  useEffect(() => {
    if (phoneResendTimer <= 0) return;
    const timer = window.setInterval(() => setPhoneResendTimer((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [phoneResendTimer]);

  useEffect(() => {
    if (emailResendTimer <= 0) return;
    const timer = window.setInterval(() => setEmailResendTimer((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [emailResendTimer]);

  useEffect(() => {
    if (normalizedFreeTag.length < 3) {
      setFreeTagState("idle");
      setTagMessage("");
      return;
    }
    if (!/^[a-z0-9_]{5,20}$/.test(normalizedFreeTag)) {
      setFreeTagState("invalid");
      setTagMessage("5–20 characters. Must include a number or '_'.");
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setFreeTagState("checking");
      try {
        const result = await checkXaneTag(normalizedFreeTag, "free");
        if (cancelled) return;
        setFreeTagState(result.available ? "available" : "taken");
        setTagMessage(result.available ? "Available ✓" : result.reason || "Already taken.");
      } catch (error) {
        if (cancelled) return;
        setFreeTagState("error");
        setTagMessage(error instanceof Error ? error.message : "Could not check XaneTag.");
      }
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedFreeTag]);

  useEffect(() => {
    if (!normalizedPremiumTag) {
      setPremiumTagState("idle");
      setPremiumMessage("");
      return;
    }
    if (!/^[a-z0-9_]{5,20}$/.test(normalizedPremiumTag)) {
      setPremiumTagState("invalid");
      setPremiumMessage("5–20 characters.");
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPremiumTagState("checking");
      try {
        const result = await checkXaneTag(normalizedPremiumTag, "premium");
        if (cancelled) return;
        setPremiumTagState(result.available ? "available" : "taken");
        setPremiumMessage(result.available ? "Available ✓" : result.reason || "Already taken.");
      } catch (error) {
        if (cancelled) return;
        setPremiumTagState("error");
        setPremiumMessage(error instanceof Error ? error.message : "Could not check Premium XaneTag.");
      }
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedPremiumTag]);

  const handlePhoneChange = (value: string) => {
    setPhone(value.replace(/\D/g, "").replace(/^234/, "").replace(/^0/, "").slice(0, 10));
    setPhoneOtpState("idle");
    setPhoneOtpCode("");
    setFormError("");
  };

  const handleEmailChange = (value: string) => {
    setEmail(value.trimStart());
    setEmailOtpState("idle");
    setEmailOtpCode("");
    setFormError("");
  };

  const sendOtp = async (purpose: "phone" | "email") => {
    const identifier = purpose === "phone" ? normalizedPhone : email.trim().toLowerCase();
    if (purpose === "phone" && phone.length !== 10) return;
    if (purpose === "email" && !validEmail) return;
    try {
      setFormError("");
      if (purpose === "phone") setPhoneOtpState("otp-sent");
      else setEmailOtpState("otp-sent");
      const result = await requestOtp(identifier, purpose);
      if (purpose === "phone") setPhoneResendTimer(result.resendAfterSeconds);
      else setEmailResendTimer(result.resendAfterSeconds);
    } catch (error) {
      if (purpose === "phone") setPhoneOtpState("error");
      else setEmailOtpState("error");
      setFormError(error instanceof Error ? error.message : "Could not send OTP.");
    }
  };

  const handleOtpChange = async (purpose: "phone" | "email", value: string) => {
    const code = value.replace(/\D/g, "").slice(0, 6);
    const identifier = purpose === "phone" ? normalizedPhone : email.trim().toLowerCase();
    if (purpose === "phone") setPhoneOtpCode(code);
    else setEmailOtpCode(code);
    if (code.length !== 6) return;

    try {
      setFormError("");
      if (purpose === "phone") setPhoneOtpState("verifying");
      else setEmailOtpState("verifying");
      await verifyOtp(identifier, purpose, code);
      if (purpose === "phone") setPhoneOtpState("verified");
      else setEmailOtpState("verified");
    } catch (error) {
      if (purpose === "phone") setPhoneOtpState("error");
      else setEmailOtpState("error");
      setFormError(error instanceof Error ? error.message : "Incorrect or expired OTP.");
    }
  };

  const handleFreeTagChange = (value: string) => {
    setFreeTag(value.replace(/^@/, "").replace(/\.xane$/i, "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20));
  };

  const handlePremiumTagChange = (value: string) => {
    setPremiumTag(value.replace(/^@/, "").replace(/\.xane$/i, "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20));
  };

  const isFormValid =
    fullName.trim().length >= 2 &&
    phone.length === 10 &&
    phoneOtpState === "verified" &&
    validEmail &&
    emailOtpState === "verified" &&
    freeTagState === "available" &&
    (!normalizedPremiumTag || premiumTagState === "available");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isFormValid || isSubmitting) return;
    setIsSubmitting(true);
    setFormError("");
    try {
      const result = await joinWaitlist({
        fullName: fullName.trim(),
        phone: normalizedPhone,
        email: email.trim().toLowerCase(),
        xaneTag: normalizedFreeTag,
        premiumXaneTag: normalizedPremiumTag || undefined,
        referralCode,
      });
      onSubmitSuccess({
        fullName: fullName.trim(),
        phone: normalizedPhone,
        email: email.trim().toLowerCase(),
        freeTag: displayTag(result.xaneTag),
        premiumTag: displayTag(normalizedPremiumTag),
        userId: result.userId,
        telegramDeepLink: result.telegramDeepLink,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not join the waitlist.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const otpBox = (purpose: "phone" | "email") => {
    const state = purpose === "phone" ? phoneOtpState : emailOtpState;
    const code = purpose === "phone" ? phoneOtpCode : emailOtpCode;
    const timer = purpose === "phone" ? phoneResendTimer : emailResendTimer;
    return (state === "otp-sent" || state === "verifying" || state === "verified") ? (
      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2">
        <div className={`relative flex items-center justify-between rounded-[14px] border px-3 py-2.5 ${state === "verified" ? "border-[#0047FF] bg-[#F0F5FF]" : "border-gray-300 bg-white"}`}>
          <input type="text" maxLength={6} disabled={state === "verified"} value={code} onChange={(e) => handleOtpChange(purpose, e.target.value)} placeholder="INPUT OTP" className="w-28 text-xs sm:text-sm font-bold tracking-widest text-[#111111] outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400" />
          {state === "otp-sent" && <div className="flex items-center gap-2 text-[10px]"><button type="button" onClick={() => sendOtp(purpose)} disabled={timer > 0} className="font-semibold text-[#0047FF] disabled:text-gray-400">Resend OTP</button><span className="font-bold text-[#0047FF]">{timer > 0 ? `0:${timer.toString().padStart(2, "0")}` : ""}</span></div>}
          {state === "verifying" && <span className="text-[11px] font-bold text-[#0047FF] animate-pulse">Verifying...</span>}
          {state === "verified" && <span className="flex items-center gap-1 text-[11px] font-bold text-[#0047FF]"><CheckCircle2 size={13} /> Verified</span>}
        </div>
      </motion.div>
    ) : null;
  };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-4 py-8 sm:py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center">
        <h1 className="font-sans text-[34px] sm:text-[46px] md:text-[54px] font-black tracking-tight text-white leading-tight">Join the Xane Waitlist.</h1>
        <p className="mt-2.5 text-base sm:text-lg md:text-xl font-medium text-white/90">Get early access, reserve your XaneTag before launch.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }} className="mt-8 sm:mt-10 w-full rounded-[32px] bg-white p-6 sm:p-8 md:p-11 shadow-2xl text-[#111111]">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5 text-left">
            <label className="text-xs font-black tracking-wider text-[#111111] uppercase">FULL NAME</label>
            <div className="relative flex items-center"><User size={19} className="pointer-events-none absolute left-4 text-gray-400" /><input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g your name" className="w-full rounded-[16px] border border-gray-300 py-3.5 pl-12 pr-4 text-sm sm:text-base font-medium outline-none transition-all placeholder:text-gray-400 focus:border-[#0047FF] focus:ring-4 focus:ring-[#0047FF]/10" /></div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
            <div className="space-y-1.5 text-left">
              <label className="text-xs font-black tracking-wider text-[#111111] uppercase">PHONE NUMBER</label>
              <div className="flex items-center gap-2"><span className="text-sm font-bold text-gray-600 whitespace-nowrap">+234</span><div className={`relative flex flex-1 items-center rounded-[16px] border bg-white ${phoneOtpState === "error" ? "border-red-500" : "border-gray-300 focus-within:border-[#0047FF] focus-within:ring-4 focus-within:ring-[#0047FF]/10"}`}><Phone size={17} className="pointer-events-none absolute left-3.5 text-gray-400" /><input type="tel" disabled={phoneOtpState === "otp-sent" || phoneOtpState === "verified" || phoneOtpState === "verifying"} value={phone} onChange={(e) => handlePhoneChange(e.target.value)} placeholder="e.g 8012345678" className="w-full rounded-[16px] bg-transparent py-3.5 pl-10 pr-16 text-xs sm:text-sm font-medium outline-none placeholder:text-gray-400 disabled:text-gray-500" />{phoneOtpState !== "verified" && <button type="button" disabled={phone.length !== 10 || phoneOtpState === "otp-sent" || phoneOtpState === "verifying"} onClick={() => sendOtp("phone")} className="absolute right-2 rounded-full bg-[#0047FF] px-2.5 py-1 text-[11px] font-bold text-white disabled:bg-gray-200 disabled:text-gray-400">Verify</button>}{phoneOtpState === "verified" && <span className="absolute right-3 text-xs font-bold text-[#0047FF]">Verified</span>}</div></div>
              {otpBox("phone")}
            </div>

            <div className="space-y-1.5 text-left">
              <label className="text-[11px] font-bold tracking-wider text-[#111111] uppercase">EMAIL ADDRESS</label>
              <div className="relative flex items-center"><Mail size={16} className="pointer-events-none absolute left-3.5 text-gray-400" /><input type="email" required disabled={emailOtpState === "otp-sent" || emailOtpState === "verified" || emailOtpState === "verifying"} value={email} onChange={(e) => handleEmailChange(e.target.value)} placeholder="e.g your@mail.com" className="w-full rounded-[14px] border border-gray-300 py-3 pl-10 pr-16 text-xs sm:text-sm font-medium outline-none transition-all placeholder:text-gray-400 focus:border-[#0047FF] focus:ring-4 focus:ring-[#0047FF]/10 disabled:bg-gray-50 disabled:text-gray-500" />{emailOtpState !== "verified" && <button type="button" disabled={!validEmail || emailOtpState === "otp-sent" || emailOtpState === "verifying"} onClick={() => sendOtp("email")} className="absolute right-2 rounded-full bg-[#0047FF] px-2.5 py-1 text-[10px] font-bold text-white disabled:bg-gray-200 disabled:text-gray-400">Verify</button>}{emailOtpState === "verified" && <span className="absolute right-3 text-xs font-bold text-[#0047FF]">Verified</span>}</div>
              {otpBox("email")}
            </div>
          </div>

          <div className="space-y-1 text-left">
            <label className="text-[11px] font-bold tracking-wider text-[#111111] uppercase">FREE XANETAG</label>
            <div className="relative flex items-center"><User size={18} className="pointer-events-none absolute left-3.5 text-gray-400" /><input type="text" required value={freeTag} onChange={(e) => handleFreeTagChange(e.target.value)} placeholder="e.g yourname_22" className={`w-full rounded-[14px] border py-3 pl-11 pr-28 text-sm font-medium outline-none transition-all placeholder:text-gray-400 focus:border-[#0047FF] focus:ring-4 focus:ring-[#0047FF]/10 ${freeTagState === "available" ? "border-emerald-400" : freeTagState === "taken" || freeTagState === "invalid" ? "border-red-400" : "border-gray-300"}`} /><span className="absolute right-3 text-xs font-bold text-gray-400">.xane</span></div>
            <div className="flex items-center justify-between gap-2 text-[10px]"><p className="text-gray-400">5–20 lowercase letters, numbers or underscores.</p><span className={freeTagState === "available" ? "font-semibold text-emerald-600" : "font-semibold text-red-500"}>{freeTagState === "checking" ? "Checking..." : freeTagState !== "idle" ? tagMessage : ""}</span></div>
          </div>

          <div className="rounded-[18px] border border-[#0047FF]/30 bg-[#F0F5FF] p-4 text-left space-y-1.5">
            <label className="text-[11px] font-bold tracking-wider text-[#0047FF] uppercase">PREMIUM XANETAG (OPTIONAL)</label>
            <div className="relative flex items-center"><div className="pointer-events-none absolute left-3 flex h-6 w-6 items-center justify-center rounded-md bg-[#0047FF] p-1 shadow-sm"><img src={xaneIcon} alt="Xane" className="h-full w-full object-contain brightness-0 invert" /></div><span className="pointer-events-none absolute left-10 text-base font-black text-[#0047FF]">@</span><input type="text" value={premiumTag} onChange={(e) => handlePremiumTagChange(e.target.value)} placeholder="yourname" className={`w-full rounded-[12px] border bg-white py-2.5 pl-16 pr-16 text-xs sm:text-sm font-semibold outline-none placeholder:text-gray-400 focus:border-[#0047FF] focus:ring-4 focus:ring-[#0047FF]/15 ${premiumTagState === "available" ? "border-emerald-400" : premiumTagState === "taken" || premiumTagState === "invalid" ? "border-red-400" : "border-[#0047FF]/40"}`} /><span className="absolute right-3 text-xs font-bold text-[#0047FF]">.xane</span></div>
            <div className="flex items-center justify-between gap-2 text-[10px]"><p className="font-medium text-gray-500">Refer 10 people in 14 days to own it.</p><span className={premiumTagState === "available" ? "font-semibold text-emerald-600" : "font-semibold text-red-500"}>{premiumTagState === "checking" ? "Checking..." : premiumTagState !== "idle" ? premiumMessage : ""}</span></div>
          </div>

          {referralCode && <p className="rounded-[12px] bg-blue-50 px-3 py-2 text-[11px] font-semibold text-[#0047FF]">Referral link detected — your signup will be credited to the referrer after activation.</p>}
          {formError && <div className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">{formError}</div>}

          <motion.button type="submit" whileHover={isFormValid ? { scale: 1.02 } : {}} whileTap={isFormValid ? { scale: 0.98 } : {}} disabled={!isFormValid || isSubmitting} className={`flex w-full items-center justify-center gap-2 rounded-full py-3.5 sm:py-4 text-sm sm:text-base font-bold transition-all shadow-md ${isFormValid ? "bg-[#0047FF] text-white hover:bg-[#0036CC]" : "bg-gray-300 text-gray-500 cursor-not-allowed opacity-80"}`}><span>{isSubmitting ? "Joining..." : "Join Waitlist"}</span><div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20"><ArrowRight size={13} strokeWidth={3} /></div></motion.button>

          <div className="flex items-center justify-center gap-3 pt-2"><div className="flex -space-x-2"><div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#0047FF] text-[9px] font-bold text-white">D</div><div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#00C853] text-[9px] font-bold text-white">S</div><div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#FFB300] text-[9px] font-bold text-white">K</div></div><div className="flex flex-col text-left"><span className="text-[10px] font-bold leading-tight">Early users already in.</span><span className="text-[10px] text-gray-500">Join before public launch.</span></div></div>
        </form>
      </motion.div>
    </div>
  );
};

export default WaitlistForm;
