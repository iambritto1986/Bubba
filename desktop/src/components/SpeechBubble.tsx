import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useSay } from "../lib/voice";

/** Bubba's speech bubble. Changing `id` animates the old line out and the new one in; `say` is spoken aloud. */
export function SpeechBubble({ id, say, children }: { id: string; say?: string; children: ReactNode }) {
  useSay(say);
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={id}
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
        className="relative w-full rounded-3xl bg-cream px-4 py-3 text-ink shadow-[0_8px_24px_-8px_rgba(43,37,64,0.35)] ring-1 ring-ink/5"
      >
        {children}
        <span className="absolute -bottom-2 left-1/2 size-4 -translate-x-1/2 rotate-45 rounded-sm bg-cream" />
      </motion.div>
    </AnimatePresence>
  );
}

export function Btn({
  children, onClick, variant = "primary", disabled, type = "button",
}: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "ghost" | "soft"; disabled?: boolean; type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-hippo-dark text-white hover:bg-[#5f50b3] shadow-[0_2px_0_#4b3e94]",
    soft: "bg-hippo-belly/60 text-ink hover:bg-hippo-belly",
    ghost: "text-ink/60 hover:text-ink hover:bg-ink/5",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-1.5 text-sm font-bold transition-[background-color,transform] active:scale-[0.97] disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}
