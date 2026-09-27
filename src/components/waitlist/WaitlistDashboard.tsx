import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Link as LinkIcon, ArrowRight } from "lucide-react";
import crownIcon from "@/assets/crown.png";
import mascot1 from "@/assets/mascot1.png";
import mascot2 from "@/assets/mascot2.png";
import mascot3 from "@/assets/mascot3.png";
import mascot4 from "@/assets/mascot4.png";
import mascot5 from "@/assets/mascot5.png";
import { getClimb, getMe } from "@/lib/waitlistApi";
import { WaitlistFormData } from "./WaitlistForm";

interface WaitlistDashboardProps {
  userData: WaitlistFormData;
  onViewLeaderboard: () => void;
}

const levelImage: Record<string, string> = {
  waitlist_member: mascot1,
  scout: mascot2,
  advocate: mascot3,
  ambassador: mascot4,
  lead: mascot5,
};

const WaitlistDashboard = ({ userData, onViewLeaderboard }: WaitlistDashboardProps) => {
  const [copiedTag, setCopiedTag] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof getMe>> | null>(null);
  const [climb, setClimb] = useState<Awaited<ReturnType<typeof getClimb>> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userData.userId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [me, climbData] = await Promise.all([getMe(userData.userId), getClimb(userData.userId)]);
        if (!cancelled) {
          setData(me);
          setClimb(climbData);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your waitlist data.");
      }
    };
    load();
    return () => { cancelled = true; };
  }, [userData.userId]);

  const displayTag = data?.xaneTag ? `@${data.xaneTag}.xane` : userData.freeTag;
  const referralLink = data?.referralLink ? data.referralLink.replace("/join?", "/waitlist?") : "";
  const rank = data?.position;
  const referralCount = data?.referralCount ?? 0;
  const currentLevel = climb?.currentLevel?.label || "Waitlist Member";
  const nextLevel = climb?.nextLevel;
  const progress = nextLevel ? Math.min(100, (referralCount / nextLevel.threshold) * 100) : 100;
  const levelImg = levelImage[climb?.currentLevel?.key || "waitlist_member"] || mascot1;

  const handleCopy = async (value: string, kind: "tag" | "link") => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    if (kind === "tag") { setCopiedTag(true); window.setTimeout(() => setCopiedTag(false), 2000); }
    else { setCopiedLink(true); window.setTimeout(() => setCopiedLink(false), 2000); }
  };

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col items-center px-4 py-8 sm:py-12 gap-5">
      {error && <div className="w-full rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">{error}</div>}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full overflow-hidden rounded-[24px] bg-white p-6 sm:p-8 shadow-xl text-[#111111]">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          <div className="flex flex-col justify-between space-y-2 text-left pr-0 sm:pr-4">
            <span className="text-xs font-semibold text-gray-500">Your XaneTag</span>
            <div className="flex items-center gap-2"><span className="font-sans text-2xl sm:text-3xl md:text-4xl font-black text-[#0047FF] tracking-tight break-all">{displayTag || "Loading..."}</span><button type="button" onClick={() => handleCopy(displayTag, "tag")} disabled={!displayTag} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600"><>{copiedTag ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}</></button></div>
            <p className="text-xs font-medium text-gray-500">Your XaneTag is reserved for you!</p>
          </div>
          <div className="flex items-center justify-between pt-4 sm:pt-0 sm:pl-8 text-left"><div className="space-y-1"><span className="text-xs font-semibold text-gray-500">Waitlist Position</span><p className="font-sans text-3xl sm:text-4xl md:text-5xl font-black text-[#0047FF] tracking-tight">{rank ? `#${rank.toLocaleString()}` : "Pending"}</p><p className="text-xs font-medium text-gray-500">Your position updates with verified referrals.</p></div><div className="w-16 sm:w-20 shrink-0"><img src={crownIcon} alt="Crown" className="w-full object-contain drop-shadow-md" /></div></div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="w-full rounded-[24px] bg-white p-6 sm:p-8 shadow-xl text-[#111111] text-center space-y-4">
        <div className="text-left"><h2 className="font-sans text-lg sm:text-xl font-bold">Move up the waitlist</h2><p className="text-xs sm:text-sm font-semibold text-gray-600 flex items-center gap-1.5 mt-0.5"><span>{nextLevel ? `Refer ${nextLevel.referralsNeeded} more` : "You reached the current highest level"}</span><ArrowRight size={14} className="text-gray-400" /><span className="text-[#0047FF]">{nextLevel?.label || "Keep referring"}</span></p></div>
        <div className="flex items-center gap-3 py-1"><span className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs sm:text-sm font-bold">{referralCount} refs</span><div className="relative h-3.5 flex-1 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-[#0047FF] transition-all duration-700" style={{ width: `${progress}%` }} /></div><span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs sm:text-sm font-bold text-[#0047FF]">{nextLevel ? `${nextLevel.referralsNeeded} to go` : "Max"}</span></div>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleCopy(referralLink, "link")} disabled={!referralLink} className="flex w-full items-center justify-center gap-2.5 rounded-full bg-[#0047FF] py-3.5 sm:py-4 px-6 text-sm sm:text-base font-bold text-white shadow-lg disabled:opacity-50"><span>{copiedLink ? "Referral link copied! 🎉" : "Copy referral link"}</span><LinkIcon size={18} /></motion.button>
        <p className="text-[11px] font-medium text-gray-500">Every verified referral moves you up and counts toward your next level.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="w-full rounded-[24px] bg-gradient-to-r from-[#0036CC] to-[#0047FF] p-5 sm:p-6 shadow-xl text-white flex flex-col sm:flex-row items-center justify-between gap-5 border border-white/10">
        <div className="flex items-center gap-4 text-left w-full sm:w-auto"><div className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 rounded-2xl bg-white/10 p-1 flex items-center justify-center"><img src={levelImg} alt={currentLevel} className="h-full w-full object-contain" /></div><div><span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Current level</span><h3 className="font-sans text-xl sm:text-2xl font-black text-white">{currentLevel}</h3><p className="text-xs font-medium text-white/80 mt-0.5">{nextLevel ? `Refer ${nextLevel.referralsNeeded} more to become ${nextLevel.label}` : "You've reached the current highest level."}</p></div></div>
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={onViewLeaderboard} className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-xs sm:text-sm font-bold text-[#0047FF] shadow-md"><span>See the Leaderboard</span><div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0047FF] text-white"><ArrowRight size={12} strokeWidth={3} /></div></motion.button>
      </motion.div>
    </div>
  );
};
export default WaitlistDashboard;
