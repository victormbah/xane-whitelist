import { useState, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Mail } from "lucide-react";

interface WaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WaitlistModal = ({ isOpen, onClose }: WaitlistModalProps) => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName || !email) return;

    setIsSubmitting(true);
    setIsSuccess(true);

    // The full backend flow (phone + email OTP, XaneTag reservation and
    // Telegram verification) lives on the dedicated /waitlist page.
    // Send users there instead of maintaining a second, incomplete signup path.
    const query = new URLSearchParams();
    if (fullName.trim()) query.set("name", fullName.trim());
    if (email.trim()) query.set("email", email.trim());
    window.location.href = `/waitlist${query.toString() ? `?${query.toString()}` : ""}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden px-4">
          {/* Darkened/Blurred Background */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-[#061540]/80 backdrop-blur-sm"
          />

          {/* MASSIVE BACKGROUND TEXT */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="pointer-events-none absolute bottom-[-10vh] left-0 flex w-full justify-center select-none lg:bottom-[-20vh]"
          >
            <span
              className="font-sans text-[clamp(100px,18vw,350px)] font-black tracking-tight text-transparent"
              style={{ WebkitTextStroke: "2px rgba(255, 255, 255, 0.25)" }}
            >
              Waitlist
            </span>
          </motion.div>

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="relative z-10 w-full max-w-[380px] max-h-[90vh] overflow-y-auto rounded-[24px] bg-white p-6 shadow-2xl min-[1650px]:max-w-[480px] min-[1650px]:p-10"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-gray-50 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-800 min-[1650px]:right-4 min-[1650px]:top-4 min-[1650px]:h-8 min-[1650px]:w-8 cursor-pointer"
            >
              <X size={16} strokeWidth={2.5} />
            </button>

            {/* Header */}
            <div className="text-center">
              <h2 className="font-sans text-[22px] font-black tracking-tight text-[#111111] min-[1650px]:text-[26px]">
                Join the Waitlist
              </h2>
              <p className="mt-1.5 text-[13px] text-gray-500 min-[1650px]:text-[14px]">
                Get early access before we launch publicly.
              </p>
            </div>

            {/* Form */}
            <form
              className="mt-6 space-y-4 min-[1650px]:mt-8 min-[1650px]:space-y-5"
              onSubmit={handleSubmit}
            >
              {/* Full Name Input */}
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-bold tracking-widest text-[#111111] uppercase">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-300 min-[1650px]:pl-4">
                    <User
                      size={16}
                      className="min-[1650px]:h-[18px] min-[1650px]:w-[18px]"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full rounded-[14px] border border-gray-200 bg-transparent py-2.5 pl-10 pr-4 text-[13px] outline-none transition-all placeholder:text-gray-300 focus:border-[#0047FF] focus:ring-4 focus:ring-[#0047FF]/10 min-[1650px]:py-3.5 min-[1650px]:pl-11 min-[1650px]:text-[14px]"
                  />
                </div>
              </div>

              {/* Email Input */}
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-bold tracking-widest text-[#111111] uppercase">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#0047FF] min-[1650px]:pl-4">
                    <Mail
                      size={16}
                      className="min-[1650px]:h-[18px] min-[1650px]:w-[18px]"
                    />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full rounded-[14px] border border-[#0047FF] bg-[#F0F5FF] py-2.5 pl-10 pr-4 text-[13px] outline-none transition-all placeholder:text-[#0047FF]/70 focus:border-[#0047FF] focus:ring-4 focus:ring-[#0047FF]/10 min-[1650px]:py-3.5 min-[1650px]:pl-11 min-[1650px]:text-[14px]"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || isSuccess}
                className="mt-4 w-full rounded-full bg-[#0047FF] py-3 text-[14px] font-bold text-white transition-all hover:bg-[#0036CC] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 min-[1650px]:mt-6 min-[1650px]:py-4 min-[1650px]:text-[15px] cursor-pointer"
              >
                {isSubmitting
                  ? "Submitting..."
                  : isSuccess
                  ? "You're in! 🎉"
                  : "Get Early Access"}
              </button>
            </form>

            {/* Footer Avatars */}
            <div className="mt-6 flex items-center justify-start gap-3 min-[1650px]:mt-8">
              <div className="flex -space-x-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#0047FF] text-[9px] font-bold text-white min-[1650px]:h-7 min-[1650px]:w-7 min-[1650px]:text-[10px]">
                  D
                </div>
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#00C853] text-[9px] font-bold text-white min-[1650px]:h-7 min-[1650px]:w-7 min-[1650px]:text-[10px]">
                  S
                </div>
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#FFB300] text-[9px] font-bold text-white min-[1650px]:h-7 min-[1650px]:w-7 min-[1650px]:text-[10px]">
                  K
                </div>
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-bold leading-tight text-[#111111] min-[1650px]:text-[11px]">
                  Early users already in.
                </span>
                <span className="text-[10px] leading-tight text-gray-500 min-[1650px]:text-[11px]">
                  Join before public launch.
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default WaitlistModal;
