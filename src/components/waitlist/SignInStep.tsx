import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mail, ChevronRight, ArrowLeft } from "lucide-react";
import { MemberView, requestLoginCode, verifyLoginCode } from "@/lib/waitlistApi";

interface SignInStepProps {
  initialEmail?: string;
  onSignedIn: (member: MemberView, email: string) => void;
  onBackToJoin: () => void;
}

/**
 * Existing members (including those whose Premium reservation expired) get back to their
 * dashboard with a one-time code sent to the email they registered with.
 */
const SignInStep: React.FC<SignInStepProps> = ({ initialEmail = "", onSignedIn, onBackToJoin }) => {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  const normalizedEmail = email.trim().toLowerCase();
  const validEmail = /^\S+@\S+\.\S+$/.test(normalizedEmail);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = window.setInterval(() => setResendTimer((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(t);
  }, [resendTimer]);

  const sendCode = async () => {
    if (!validEmail || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestLoginCode(normalizedEmail);
      setNotice(result.message);
      setStage("code");
      setCode("");
      setResendTimer(result.resendAfterSeconds || 60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a sign-in code.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    try {
      const member = await verifyLoginCode(normalizedEmail, digits);
      onSignedIn(member, normalizedEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect or expired code.");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center px-4 py-8 sm:py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <h1 className="font-sans text-[32px] sm:text-[42px] font-black tracking-tight text-white leading-tight">
          Welcome back.
        </h1>
        <p className="mt-2.5 text-base sm:text-lg font-medium text-white/90">
          Sign in to see your place, referrals and level.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-8 w-full rounded-[32px] bg-white p-6 sm:p-8 shadow-2xl text-[#111111] space-y-5 text-left"
      >
        <div className="space-y-1.5">
          <label htmlFor="signin-email" className="text-[11px] font-bold tracking-wider uppercase">
            Email address
          </label>
          <div className="relative flex items-center">
            <Mail size={16} className="pointer-events-none absolute left-3.5 text-gray-400" />
            <input
              id="signin-email"
              type="email"
              autoComplete="email"
              value={email}
              disabled={stage === "code"}
              onChange={(e) => setEmail(e.target.value.trimStart())}
              onKeyDown={(e) => e.key === "Enter" && sendCode()}
              placeholder="The email you joined with"
              className="w-full rounded-[14px] border border-gray-300 py-3 pl-10 pr-4 text-sm font-medium outline-none focus:border-[#0047FF] focus:ring-4 focus:ring-[#0047FF]/10 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        </div>

        {stage === "code" && (
          <div className="space-y-1.5">
            <label htmlFor="signin-code" className="text-[11px] font-bold tracking-wider uppercase">
              6-digit code
            </label>
            <input
              id="signin-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              disabled={busy}
              onChange={(e) => submitCode(e.target.value)}
              placeholder="••••••"
              className="w-full rounded-[14px] border border-gray-300 py-3 px-4 text-lg font-bold tracking-[0.5em] outline-none focus:border-[#0047FF] focus:ring-4 focus:ring-[#0047FF]/10"
            />
            {notice && <p className="text-[11px] font-medium text-gray-500">{notice}</p>}
            <div className="flex items-center justify-between text-[11px]">
              <button
                type="button"
                onClick={() => { setStage("email"); setError(""); setNotice(""); }}
                className="font-semibold text-gray-500 hover:text-gray-700"
              >
                Use a different email
              </button>
              <button
                type="button"
                onClick={sendCode}
                disabled={resendTimer > 0 || busy}
                className="font-semibold text-[#0047FF] disabled:text-gray-400"
              >
                {resendTimer > 0 ? `Resend in 0:${resendTimer.toString().padStart(2, "0")}` : "Resend code"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
            {error}
          </div>
        )}

        {stage === "email" && (
          <button
            type="button"
            onClick={sendCode}
            disabled={!validEmail || busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0047FF] py-3.5 text-sm sm:text-base font-bold text-white shadow-md hover:bg-[#0036CC] disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <span>{busy ? "Sending..." : "Send sign-in code"}</span>
            <ChevronRight size={16} strokeWidth={2.8} />
          </button>
        )}

        <button
          type="button"
          onClick={onBackToJoin}
          className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={13} /> Not on the waitlist yet? Join
        </button>
      </motion.div>
    </div>
  );
};

export default SignInStep;
