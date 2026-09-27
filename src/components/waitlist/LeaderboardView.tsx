import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import crownIcon from "@/assets/crown.png";
import mascot1 from "@/assets/mascot1.png";
import mascot2 from "@/assets/mascot2.png";
import mascot3 from "@/assets/mascot3.png";
import mascot4 from "@/assets/mascot4.png";
import mascot5 from "@/assets/mascot5.png";
import mascot6 from "@/assets/mascot6.png";
import lockIcon from "@/assets/lock.png";
import { getLeaderboard } from "@/lib/waitlistApi";

interface Props { currentUserTag?: string; }
const badgeImage: Record<string, string> = { "Waitlist Member": mascot1, "Xane Scout": mascot2, "Xane Advocate": mascot3, "Xane Ambassador": mascot4, "Xane Lead": mascot5, "Xane Captain": mascot6, "Xane Founding Council": mascot6 };

const LeaderboardView = ({ currentUserTag = "" }: Props) => {
  const [activeTab, setActiveTab] = useState<"leaderboard" | "levels">("leaderboard");
  const [rows, setRows] = useState<{ rank: number; username: string; badge: string; friends: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getLeaderboard().then((result) => { if (!cancelled) setRows(result.leaderboard); }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load leaderboard."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const leader = rows[0];
  const currentIndex = rows.findIndex((row) => row.username.toLowerCase() === currentUserTag.toLowerCase());

  return (
    <div className="mx-auto flex w-full max-w-[1050px] flex-col items-center px-4 py-8 sm:py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-[700px] text-center">
        <h1 className="font-sans text-[28px] sm:text-[38px] md:text-[46px] font-black leading-tight tracking-tight text-white">Refer Friends to Climb The Ranks and Unlock Rewards at Launch</h1>
      </motion.div>
      <div className="mt-8 flex items-center rounded-full border border-white/20 bg-[#0036CC]/80 p-1 backdrop-blur-md shadow-inner">
        <button type="button" onClick={() => setActiveTab("leaderboard")} className={`rounded-full px-6 py-2 text-xs sm:text-sm font-bold ${activeTab === "leaderboard" ? "bg-white text-[#0047FF] shadow-md" : "text-white"}`}>Leaderboard</button>
        <button type="button" onClick={() => setActiveTab("levels")} className={`rounded-full px-6 py-2 text-xs sm:text-sm font-bold ${activeTab === "levels" ? "bg-white text-[#0047FF] shadow-md" : "text-white"}`}>Levels</button>
      </div>

      {activeTab === "leaderboard" ? (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mt-8 w-full max-w-[850px] flex flex-col items-center">
          <div className="mt-2 flex flex-col items-center text-center">
            <div className="w-10 sm:w-12 drop-shadow-lg"><img src={crownIcon} alt="Crown" className="w-full object-contain" /></div>
            <p className="mt-1 font-sans text-xl sm:text-2xl font-black text-white">{leader ? <><span className="text-[#D9FF3F]">{leader.username}</span> is leading</> : "Leaderboard"}</p>
            <p className="text-xs sm:text-sm text-white/80">{leader ? `${leader.friends} verified referrals` : "Real-time active waitlist members"}</p>
          </div>
          {error && <div className="mt-5 w-full rounded-[14px] bg-red-500/20 px-4 py-3 text-xs font-semibold text-white">{error}</div>}
          <div className="mt-6 w-full overflow-hidden rounded-[24px] border border-white/15 bg-[#0036CC]/80 backdrop-blur-xl shadow-2xl">
            <div className="grid grid-cols-12 bg-[#0047FF] px-6 py-3.5 text-xs font-bold text-white"><div className="col-span-2">Rank</div><div className="col-span-7 text-center">XaneTag / Badge</div><div className="col-span-3 text-right">Verified Referrals</div></div>
            <div className="divide-y divide-white/10 text-xs sm:text-sm font-medium text-white">
              {loading ? <div className="px-6 py-8 text-center text-white/70">Loading leaderboard...</div> : rows.length === 0 ? <div className="px-6 py-8 text-center text-white/70">No active members yet.</div> : rows.map((row) => (
                <div key={row.rank} className={`grid grid-cols-12 items-center px-6 py-3.5 transition-colors ${row.username.toLowerCase() === currentUserTag.toLowerCase() ? "bg-[#0047FF]" : "hover:bg-white/5"}`}>
                  <div className="col-span-2 text-left font-bold">#{row.rank}</div>
                  <div className="col-span-7 flex items-center justify-center gap-2"><span>{row.username}</span><span className="text-white/60">·</span><span>{row.badge}</span><img src={badgeImage[row.badge] || mascot1} alt={row.badge} className="h-6 w-6 object-contain" /></div>
                  <div className="col-span-3 text-right font-bold">{row.friends}</div>
                </div>
              ))}
            </div>
          </div>
          {currentIndex < 0 && currentUserTag && <p className="mt-3 text-[11px] text-white/70">Your tag will appear in the public leaderboard once your account is active and within the returned leaderboard results.</p>}
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mt-8 w-full max-w-[960px] grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Waitlist Member", "Free XaneTag, a place on the list", "Current level", mascot1],
            ["Xane Scout", "Level 1 + early Xane updates", "3 refs", mascot2],
            ["Xane Advocate", "Level 2 + premium XaneTag, early opportunities", "10 refs", mascot3],
            ["Xane Ambassador", "Level 3 + host campaigns, incentives", "30 refs", mascot4],
            ["Xane Lead", "Level 4 + represent Xane in your city, merch", "50 refs", mascot5],
          ].map(([title, desc, threshold, img]) => <div key={title} className="flex flex-col items-center justify-between rounded-[24px] border border-white/15 bg-[#0036CC]/80 p-6 text-center shadow-xl"><div className="h-28 w-28 flex items-center justify-center"><img src={img} alt={title} className="h-full w-full object-contain" /></div><div className="mt-3 space-y-1"><h3 className="font-sans text-xl font-black text-white">{title}</h3><p className="text-xs text-white/80">{desc}</p></div><div className="mt-4 font-sans text-sm font-black text-white">{threshold}</div></div>)}
          {["Xane Captain", "Xane Founding Council"].map((title) => <div key={title} className="flex flex-col items-center justify-between rounded-[24px] border border-[#F3E5AB]/40 bg-[#E8DAB2]/90 p-6 text-center shadow-xl"><div className="h-24 w-24 flex items-center justify-center"><img src={lockIcon} alt="Locked" className="h-16 w-16 object-contain" /></div><div className="mt-3 space-y-1"><h3 className="font-sans text-lg font-black text-[#0047FF]">Revealed at launch</h3><p className="text-xs font-semibold text-[#5A4E20]">{title}</p></div><div className="mt-4 text-xs font-bold text-[#5A4E20]">🔒 Locked</div></div>)}
        </motion.div>
      )}
    </div>
  );
};
export default LeaderboardView;
