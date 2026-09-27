import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import WaitlistBackground from "@/components/waitlist/WaitlistBackground";
import WaitlistHeader from "@/components/waitlist/WaitlistHeader";
import WaitlistForm, { WaitlistFormData } from "@/components/waitlist/WaitlistForm";
import TelegramStep from "@/components/waitlist/TelegramStep";
import CelebrationStep from "@/components/waitlist/CelebrationStep";
import WaitlistDashboard from "@/components/waitlist/WaitlistDashboard";
import LeaderboardView from "@/components/waitlist/LeaderboardView";
import WaitlistFooter from "@/components/waitlist/WaitlistFooter";

type WaitlistViewStep = "form" | "telegram" | "celebration" | "dashboard" | "leaderboard";

const WaitlistPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const initialView = location.pathname === "/leaderboard" ? "leaderboard" : ((searchParams.get("view") as WaitlistViewStep) || "form");
  const [currentStep, setCurrentStep] = useState<WaitlistViewStep>(initialView);

  // User State saved in localStorage for seamless return
  const [userData, setUserData] = useState<WaitlistFormData>(() => {
    const saved = localStorage.getItem("xane_waitlist_user");
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore invalid local state */ }
    }
    return {
      fullName: "",
      phone: "",
      email: "",
      freeTag: "",
      premiumTag: "",
      userId: "",
      telegramDeepLink: "",
    };
  });

  useEffect(() => {
    const viewParam = searchParams.get("view") as WaitlistViewStep;
    if (viewParam && ["form", "telegram", "celebration", "dashboard", "leaderboard"].includes(viewParam)) {
      setCurrentStep(viewParam);
    }
  }, [searchParams]);

  // Step 1 Complete: Transition to Telegram Step
  const handleFormSuccess = (data: WaitlistFormData) => {
    setUserData(data);
    localStorage.setItem("xane_waitlist_user", JSON.stringify(data));
    setCurrentStep("telegram");
    setSearchParams({ view: "telegram" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Step 2 Complete: Transition to Celebration Step ("You're on the list")
  const handleTelegramContinue = () => {
    setCurrentStep("celebration");
    setSearchParams({ view: "celebration" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Step 3 Complete: Transition to Dashboard
  const handleCelebrationContinue = () => {
    setCurrentStep("dashboard");
    setSearchParams({ view: "dashboard" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Switch to Leaderboard
  const handleGoToLeaderboard = () => {
    setCurrentStep("leaderboard");
    setSearchParams({ view: "leaderboard" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Switch back to Form / Waitlist
  const handleGoToForm = () => {
    setCurrentStep("form");
    setSearchParams({ view: "form" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <WaitlistBackground variant={currentStep} showWatermark={true}>
      {/* Dynamic Header based on active view */}
      {currentStep === "leaderboard" ? (
        <WaitlistHeader
          rightAction="leaderboard-nav"
          onJoinWaitlistClick={handleGoToForm}
        />
      ) : currentStep === "telegram" || currentStep === "celebration" ? null : (
        <WaitlistHeader rightAction="homepage" />
      )}

      {/* Main View Switcher */}
      <main className="flex flex-1 flex-col items-center justify-center">
        {currentStep === "form" && (
          <WaitlistForm onSubmitSuccess={handleFormSuccess} />
        )}

        {currentStep === "telegram" && (
          <TelegramStep userId={userData.userId} telegramUrl={userData.telegramDeepLink} onContinue={handleTelegramContinue} />
        )}

        {currentStep === "celebration" && (
          <CelebrationStep onContinue={handleCelebrationContinue} />
        )}

        {currentStep === "dashboard" && (
          <WaitlistDashboard
            userData={userData}
            onViewLeaderboard={handleGoToLeaderboard}
          />
        )}

        {currentStep === "leaderboard" && (
          <LeaderboardView
            currentUserTag={userData.premiumTag || userData.freeTag}
          />
        )}
      </main>

      {/* Footer */}
      <WaitlistFooter />
    </WaitlistBackground>
  );
};

export default WaitlistPage;
