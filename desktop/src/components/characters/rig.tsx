import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useChat } from "../../lib/conversation";
import { useGaze } from "../../lib/useGaze";
import { useSpeaking, useVoiceLevel } from "../../lib/voice";

export type Mood = "idle" | "happy" | "focus" | "sleepy" | "think" | "cheer" | "oops";

/** Everything a character needs to know to look alive: mood, voice-chat state, loudness, gaze, blinks. */
export function useLive(mood: Mood) {
  const chat = useChat();
  const talking = useSpeaking();
  const level = useVoiceLevel();
  const gaze = useGaze();
  const [blink, setBlink] = useState(false);

  const listening = chat.status === "listening";
  const thinking = mood === "think" || chat.status === "connecting";
  const asleep = mood === "sleepy";
  const cheering = mood === "cheer";

  useEffect(() => {
    if (asleep) return;
    let t = 0;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 120);
        if (Math.random() < 0.25) window.setTimeout(() => { setBlink(true); window.setTimeout(() => setBlink(false), 110); }, 260);
        loop();
      }, 2000 + Math.random() * 3500);
    };
    loop();
    return () => window.clearTimeout(t);
  }, [asleep]);

  const look =
    thinking ? { x: 5, y: -6 } :
    mood === "focus" ? { x: 0, y: 4 } :
    asleep ? { x: 0, y: 0 } :
    { x: gaze.x * 7, y: gaze.y * 5 };

  return { mood, listening, thinking, asleep, cheering, talking, level, gaze, blink, look };
}
export type Live = ReturnType<typeof useLive>;

/** Whole-body motion for each state (breathing, hops, sways, leaning in to listen). */
export function bodyMotion(l: Live, opts: { squash?: boolean } = {}) {
  const sq = opts.squash ?? true;
  if (l.asleep) return { y: [0, 1.5, 0], scaleY: [1, 0.988, 1], rotate: 0, transition: { duration: 4.2, repeat: Infinity, ease: "easeInOut" as const } };
  if (l.cheering) return { y: [0, -20, 0, -10, 0], scaleY: sq ? [1, 1.04, 0.95, 1.02, 1] : 1, rotate: 0, transition: { duration: 0.95, repeat: Infinity, repeatDelay: 0.5 } };
  if (l.thinking) return { rotate: [-3, 3, -3], y: 0, transition: { duration: 2.6, repeat: Infinity, ease: "easeInOut" as const } };
  if (l.mood === "oops") return { rotate: -6, y: 3, scaleY: 0.98, transition: { type: "spring" as const, stiffness: 220, damping: 12 } };
  if (l.listening) return { y: -4, rotate: l.gaze.x * 3, scaleY: 1.015, transition: { type: "spring" as const, stiffness: 240, damping: 18 } };
  return { y: [0, -2.5, 0], scaleY: [1, 1.012, 1], rotate: 0, transition: { duration: 3.4, repeat: Infinity, ease: "easeInOut" as const } };
}

/** Arm swing: up for a cheer, small gestures while talking. */
export function armMotion(l: Live, side: -1 | 1, rest = 0) {
  return {
    rotate: l.cheering ? side * 150 : l.talking ? side * (rest + 6 + l.level * 22) : l.mood === "oops" ? side * (rest + 25) : side * rest,
    transition: { type: "spring" as const, stiffness: 240, damping: 15 },
  };
}

/** Little status signals: sound waves (listening), thought dots (thinking), z's (asleep). */
export function StatusFx({ l, x = 158, y = 36 }: { l: Live; x?: number; y?: number }) {
  return (
    <>
      {l.listening && (
        <g stroke="#7FC8A9" strokeWidth="3" strokeLinecap="round" fill="none">
          {[0, 1].map((i) => (
            <motion.path key={i} d={`M${x + i * 8} ${y - i * 4} q ${6 + i * 3} 9 0 ${18 + i * 7}`}
              animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }} />
          ))}
        </g>
      )}
      {l.thinking && (
        <g fill="#B9A6D9">
          {[0, 1, 2].map((i) => (
            <motion.circle key={i} cx={x - 8 + i * 11} cy={y - 6 - i * 6} r={3 + i}
              animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
          ))}
        </g>
      )}
      {l.asleep && (
        <motion.text x={x - 6} y={y} fontSize="22" fontWeight="800" fill="#B9A6D9"
          animate={{ opacity: [0, 1, 0], y: [0, -10, -20] }} transition={{ duration: 2.4, repeat: Infinity }}>z</motion.text>
      )}
    </>
  );
}
