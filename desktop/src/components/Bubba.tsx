import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useSpeaking, useVoiceLevel } from "../lib/voice";

export type Mood = "idle" | "happy" | "focus" | "sleepy" | "think" | "cheer" | "oops";

/**
 * Placeholder Bubba, drawn in SVG. The Rive character replaces this later;
 * the rest of the app only talks to it through `mood`.
 */
export function Bubba({ mood, size = 180 }: { mood: Mood; size?: number }) {
  const [blink, setBlink] = useState(false);
  const talking = useSpeaking();
  const level = useVoiceLevel();

  useEffect(() => {
    if (mood === "sleepy") return;
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 130);
        loop();
      }, 2200 + Math.random() * 3200);
    };
    loop();
    return () => window.clearTimeout(t);
  }, [mood]);

  const look = mood === "think" ? { x: 2, y: -4 } : mood === "focus" ? { x: 0, y: 2 } : { x: 0, y: 0 };
  const eyesClosed = mood === "sleepy" || blink;
  const bounce =
    mood === "cheer"
      ? { y: [0, -18, 0, -10, 0], transition: { duration: 0.9, repeat: Infinity, repeatDelay: 0.6 } }
      : mood === "sleepy"
        ? { y: [0, 2, 0], scaleY: [1, 0.98, 1], transition: { duration: 4, repeat: Infinity } }
        : { y: [0, -4, 0], transition: { duration: 3, repeat: Infinity, ease: "easeInOut" as const } };

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      animate={bounce}
      style={{ originY: 1, overflow: "visible" }}
      aria-label={`Bubba is ${mood}`}
    >
      {/* shadow */}
      <ellipse cx="100" cy="196" rx="62" ry="5" fill="#2b2540" opacity="0.12" />
      {/* feet */}
      <ellipse cx="70" cy="188" rx="16" ry="9" fill="var(--color-hippo-dark)" />
      <ellipse cx="130" cy="188" rx="16" ry="9" fill="var(--color-hippo-dark)" />
      {/* body + belly */}
      <ellipse cx="100" cy="152" rx="68" ry="40" fill="var(--color-hippo)" />
      <ellipse cx="100" cy="162" rx="40" ry="24" fill="var(--color-hippo-belly)" />
      {/* ears */}
      {[62, 138].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="52" rx="11" ry="13" fill="var(--color-hippo)" />
          <ellipse cx={x} cy="54" rx="5.5" ry="7" fill="var(--color-blush)" />
        </g>
      ))}
      {/* head */}
      <ellipse cx="100" cy="92" rx="58" ry="47" fill="var(--color-hippo)" />
      {/* eyes */}
      {[80, 120].map((x) =>
        eyesClosed ? (
          <path key={x} d={`M${x - 8} 80 Q${x} 86 ${x + 8} 80`} stroke="var(--color-ink)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        ) : (
          <g key={x}>
            <circle cx={x} cy="78" r="11" fill="white" />
            <circle cx={x + look.x} cy={79 + look.y} r="6.5" fill="var(--color-ink)" />
            <circle cx={x + look.x + 2.5} cy={76 + look.y} r="2.2" fill="white" />
          </g>
        ),
      )}
      {/* focus brows */}
      {mood === "focus" && (
        <g stroke="var(--color-hippo-dark)" strokeWidth="3.5" strokeLinecap="round">
          <path d="M70 63 L88 66" />
          <path d="M130 63 L112 66" />
        </g>
      )}
      {/* cheeks */}
      <circle cx="62" cy="104" r="8" fill="var(--color-blush)" opacity="0.55" />
      <circle cx="138" cy="104" r="8" fill="var(--color-blush)" opacity="0.55" />
      {/* snout */}
      <ellipse cx="100" cy="114" rx="40" ry="26" fill="var(--color-hippo-belly)" />
      <ellipse cx="88" cy="106" rx="4" ry="6" fill="var(--color-hippo-dark)" />
      <ellipse cx="112" cy="106" rx="4" ry="6" fill="var(--color-hippo-dark)" />
      {/* mouth: moves with his voice while he talks */}
      {talking ? <TalkingMouth level={level} /> : <Mouth mood={mood} />}
      {/* sleepy z's */}
      {mood === "sleepy" && (
        <motion.text
          x="150" y="42" fontSize="22" fontWeight="800" fill="var(--color-hippo-dark)"
          animate={{ opacity: [0, 1, 0], y: [0, -10, -20] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        >
          z
        </motion.text>
      )}
    </motion.svg>
  );
}

function TalkingMouth({ level }: { level: number }) {
  const open = 2 + level * 11;
  return (
    <g>
      <ellipse cx="100" cy={122 + open / 3} rx={10 + level * 4} ry={open} fill="var(--color-ink)" />
      {open > 6 && <ellipse cx="100" cy={122 + open / 3 + open * 0.55} rx={6} ry={open * 0.3} fill="var(--color-blush)" />}
    </g>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  const stroke = { stroke: "var(--color-ink)", strokeWidth: 3.5, strokeLinecap: "round" as const, fill: "none" };
  switch (mood) {
    case "happy":
    case "cheer":
      return (
        <g>
          <path d="M82 121 Q100 138 118 121 Z" fill="var(--color-ink)" />
          <rect x="91" y="121" width="7" height="6" rx="1.5" fill="white" />
          <rect x="102" y="121" width="7" height="6" rx="1.5" fill="white" />
        </g>
      );
    case "oops":
      return <path d="M88 128 Q100 120 112 128" {...stroke} />;
    case "sleepy":
      return <ellipse cx="100" cy="125" rx="4" ry="5" fill="var(--color-ink)" />;
    case "think":
      return <path d="M92 125 L110 122" {...stroke} />;
    case "focus":
      return <path d="M92 124 Q100 127 108 124" {...stroke} />;
    default:
      return <path d="M88 122 Q100 131 112 122" {...stroke} />;
  }
}
