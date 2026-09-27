import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight } from "lucide-react";
import telegramPlane from "@/assets/telegramplane.png";
import xaneLogo from "@/assets/xane-logo.png";
import { getTelegramStatus } from "@/lib/waitlistApi";

interface TelegramStepProps {
  onContinue: () => void;
  telegramUrl?: string;
  userId?: string;
}

const TelegramStep = ({ onContinue, telegramUrl, userId }: TelegramStepProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [hasClicked, setHasClicked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const status = await getTelegramStatus(userId);
        if (cancelled) return;
        if (status.telegramConnected && status.status === "active") {
          setIsConnected(true);
          if (timer) window.clearInterval(timer);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not check Telegram status.");
      }
    };

    poll();
    timer = window.setInterval(poll, 2500);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [userId]);

  const handleJoinTelegram = () => {
    if (!telegramUrl) {
      setError("Telegram link is not available. Please return to the waitlist form and try again.");
      return;
    }
    window.open(telegramUrl, "_blank", "noopener,noreferrer");
    setHasClicked(true);
  };

  return (
    <div className="relative flex min-h-[85vh] w-full flex-col items-center justify-between px-4 py-8 sm:py-12 overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-[8%] sm:top-[10%] z-10 w-[110px] sm:w-[140px] md:w-[180px] lg:w-[210px] xl:w-[230px] max-w-[240px] -translate-x-[18%] select-none"><motion.img initial={{ opacity: 0, x: -50, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.7 }} src={telegramPlane} alt="Telegram Plane" className="w-full object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.4)]" /></div>
      <div className="relative z-20 flex w-full items-center justify-center pt-2 sm:pt-4"><img src={xaneLogo} alt="Xane" className="h-8 sm:h-10 md:h-12 w-auto drop-shadow-md" /></div>
      <div className="relative z-20 mx-auto my-auto flex w-full max-w-[850px] flex-col items-center text-center px-4">
        <motion.h1 initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="font-sans text-[44px] sm:text-[62px] md:text-[76px] lg:text-[84px] font-black leading-[1.04] tracking-tight text-white">Become a part of <br />Xane.</motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }} className="mt-4 sm:mt-6 max-w-[580px] text-base sm:text-xl md:text-2xl font-medium text-white/95">Join the community to complete your waitlist sign-up.</motion.p>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="mt-10 sm:mt-14 flex w-full max-w-[420px] flex-col items-center gap-4">
          {isConnected && <div className="flex items-center gap-2 rounded-full bg-emerald-500/25 px-5 py-2 text-xs sm:text-sm font-bold text-white border border-emerald-400/50 backdrop-blur-md shadow-lg"><CheckCircle2 size={18} className="text-emerald-400" /><span>Telegram Connected Successfully</span></div>}
          {error && <p className="rounded-xl bg-red-500/20 px-4 py-2 text-xs font-semibold text-white">{error}</p>}
          {!isConnected ? <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={handleJoinTelegram} className="flex w-full items-center justify-center gap-4 rounded-full bg-white py-4 sm:py-5 px-8 sm:px-12 text-lg sm:text-2xl font-black text-[#0047FF] shadow-[0_20px_50px_rgba(0,0,0,0.35)]"> <span>{hasClicked ? "Waiting for Telegram..." : "Join Telegram"}</span><div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-[#0047FF] text-white"><ArrowRight size={18} strokeWidth={3} /></div></motion.button> : <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={onContinue} className="flex w-full items-center justify-center gap-4 rounded-full bg-white py-4 sm:py-5 px-8 sm:px-12 text-lg sm:text-2xl font-black text-[#0047FF] shadow-[0_20px_50px_rgba(0,0,0,0.35)]"><span>Continue</span><div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-[#0047FF] text-white"><ArrowRight size={18} strokeWidth={3} /></div></motion.button>}
          {hasClicked && !isConnected && <p className="text-xs font-medium text-white/80">Open the bot, tap Start, then join the Xane community group. This page will detect the verification automatically.</p>}
        </motion.div>
      </div>
      <div className="h-6 sm:h-10" />
    </div>
  );
};
export default TelegramStep;
