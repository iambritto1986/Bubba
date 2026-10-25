import { motion } from "motion/react";
import { useEffect, useId, useState } from "react";
import { useChat } from "../../lib/conversation";
import { useGaze } from "../../lib/useGaze";
import { useSpeaking, useVoiceLevel } from "../../lib/voice";
import type { Mood } from "./rig";


const BODY = "M100 42 C146 42 170 80 170 124 C170 166 142 190 100 190 C58 190 30 166 30 124 C30 80 54 42 100 42 Z";
const INK = "#2a2230";

/**
 * The plush mascot: a soft, fuzzy creature drawn in SVG (shown before a companion is picked).
 * Fur comes from an SVG displacement filter; everything else is driven by state:
 * mood (from the app), whether he's listening/thinking (voice chat), how loud he's talking, and where your cursor is.
 */
export function Plush({ mood, size = 180 }: { mood: Mood; size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = (n: string) => `${n}-${uid}`;
  const chat = useChat();
  const talking = useSpeaking();
  const level = useVoiceLevel();
  const gaze = useGaze();
  const [blink, setBlink] = useState(false);

  const listening = chat.status === "listening";
  const thinking = mood === "think" || chat.status === "connecting";
  const asleep = mood === "sleepy";
  const cheering = mood === "cheer";

  // Random blinks, sometimes a double blink.
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

  const bodyAnim =
    asleep ? { y: [0, 1.5, 0], scaleY: [1, 0.985, 1], scaleX: [1, 1.012, 1], rotate: 0, transition: { duration: 4.2, repeat: Infinity, ease: "easeInOut" as const } } :
    cheering ? { y: [0, -24, 0, -12, 0], scaleY: [1, 1.05, 0.93, 1.02, 1], scaleX: [1, 0.96, 1.06, 0.99, 1], rotate: 0, transition: { duration: 0.95, repeat: Infinity, repeatDelay: 0.5 } } :
    thinking ? { rotate: [-4, 4, -4], y: 0, transition: { duration: 2.6, repeat: Infinity, ease: "easeInOut" as const } } :
    mood === "oops" ? { rotate: -7, y: 3, scaleY: 0.97, transition: { type: "spring" as const, stiffness: 220, damping: 12 } } :
    listening ? { y: -4, rotate: gaze.x * 3, scaleY: 1.025, scaleX: 0.99, transition: { type: "spring" as const, stiffness: 240, damping: 18 } } :
    { y: [0, -3, 0], scaleY: [1, 1.018, 1], rotate: 0, transition: { duration: 3.4, repeat: Infinity, ease: "easeInOut" as const } };

  // Ears perk up when he listens, droop when he sleeps.
  const ear = (side: -1 | 1) => ({
    rotate: listening ? side * -16 : asleep ? side * 14 : thinking ? side * -6 : 0,
    y: listening ? -5 : asleep ? 3 : 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 14 },
  });
  // Little arms: up for a cheer, small gestures while talking.
  const arm = (side: -1 | 1) => ({
    rotate: cheering ? side * 70 : talking ? side * (8 + level * 25) : mood === "oops" ? side * 30 : 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 15 },
  });

  const talkLift = talking ? level * 4 : 0;

  return (
    <motion.svg width={size} height={size} viewBox="0 0 200 210" style={{ overflow: "visible" }} aria-label={`Bubba is ${listening ? "listening" : thinking ? "thinking" : talking ? "talking" : mood}`}>
      <defs>
        <radialGradient id={ref("fur")} cx="40%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#FFFCF7" />
          <stop offset="55%" stopColor="#FBEEE2" />
          <stop offset="100%" stopColor="#E7CFC0" />
        </radialGradient>
        <radialGradient id={ref("belly")} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#F2E7FB" />
          <stop offset="100%" stopColor="#E3D2F2" />
        </radialGradient>
        <radialGradient id={ref("cheek")}>
          <stop offset="0%" stopColor="#FF9EA2" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#FF9EA2" stopOpacity="0" />
        </radialGradient>
        <filter id={ref("fuzz")} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={ref("grain")}>
          <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="2" />
          <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.42  0 0 0 0 0.38  0.5 0 0 0 -0.12" />
        </filter>
        <filter id={ref("soft")}><feGaussianBlur stdDeviation="6" /></filter>
        <clipPath id={ref("clip")}><path d={BODY} /></clipPath>
      </defs>

      {/* ground shadow */}
      <motion.ellipse cx="100" cy="196" rx="58" ry="6" fill={INK} opacity={0.13}
        animate={cheering ? { rx: [58, 40, 58, 48, 58] } : { rx: 58 }} transition={cheering ? { duration: 0.95, repeat: Infinity, repeatDelay: 0.5 } : {}} />

      <motion.g animate={bodyAnim} style={{ originX: 0.5, originY: 1 }}>
        <g transform={`translate(0 ${-talkLift})`}>
          {/* ears (behind the body) */}
          <g filter={`url(#${ref("fuzz")})`}>
            {([-1, 1] as const).map((s) => (
              <motion.g key={s} animate={ear(s)} style={{ originX: 0.5, originY: 1 }}>
                <ellipse cx={100 + s * 34} cy="50" rx="15" ry="14" fill={`url(#${ref("fur")})`} />
                <ellipse cx={100 + s * 34} cy="51" rx="8" ry="7" fill="#FFC6B4" />
              </motion.g>
            ))}
          </g>

          {/* arms, feet, body: all fuzzy */}
          <g filter={`url(#${ref("fuzz")})`}>
            {([-1, 1] as const).map((s) => (
              <motion.ellipse key={`arm${s}`} cx={100 + s * 72} cy="138" rx="11" ry="17" fill={`url(#${ref("fur")})`}
                animate={arm(s)} style={{ originX: 0.5, originY: 0.15 }} />
            ))}
            <ellipse cx="74" cy="188" rx="17" ry="9" fill="#F3DDD0" />
            <ellipse cx="126" cy="188" rx="17" ry="9" fill="#F3DDD0" />
            <path d={BODY} fill={`url(#${ref("fur")})`} />
            <ellipse cx="100" cy="160" rx="38" ry="25" fill={`url(#${ref("belly")})`} opacity="0.9" />
          </g>

          {/* fur grain + a soft top highlight, kept inside the body */}
          <g clipPath={`url(#${ref("clip")})`}>
            <rect x="20" y="30" width="160" height="170" filter={`url(#${ref("grain")})`} opacity="0.55" />
            <ellipse cx="84" cy="70" rx="34" ry="16" fill="white" opacity="0.45" filter={`url(#${ref("soft")})`} />
          </g>

          {/* face */}
          <motion.g animate={{ x: look.x * 0.35, y: look.y * 0.3 }} transition={{ type: "spring", stiffness: 120, damping: 16 }}>
            <circle cx="64" cy="126" r="15" fill={`url(#${ref("cheek")})`} opacity={cheering || talking ? 1 : 0.8} />
            <circle cx="136" cy="126" r="15" fill={`url(#${ref("cheek")})`} opacity={cheering || talking ? 1 : 0.8} />
            <Eyes x={look.x} y={look.y} closed={asleep || blink} happy={cheering} wide={listening} sleepy={mood === "focus"} />
            <Mouth mood={mood} talking={talking} level={level} />
          </motion.g>
        </g>

        {/* status touches */}
        {listening && (
          <g stroke="#7FC8A9" strokeWidth="3" strokeLinecap="round" fill="none">
            {[0, 1].map((i) => (
              <motion.path key={i} d={`M${158 + i * 8} ${36 - i * 4} q ${6 + i * 3} 9 0 ${18 + i * 7}`}
                animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }} />
            ))}
          </g>
        )}
        {thinking && (
          <g fill="#B9A6D9">
            {[0, 1, 2].map((i) => (
              <motion.circle key={i} cx={150 + i * 11} cy={30 - i * 6} r={3 + i}
                animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
            ))}
          </g>
        )}
        {asleep && (
          <motion.text x="152" y="40" fontSize="22" fontWeight="800" fill="#B9A6D9"
            animate={{ opacity: [0, 1, 0], y: [0, -10, -20] }} transition={{ duration: 2.4, repeat: Infinity }}>z</motion.text>
        )}
      </motion.g>
    </motion.svg>
  );
}

function Eyes({ x, y, closed, happy, wide, sleepy }: { x: number; y: number; closed: boolean; happy: boolean; wide: boolean; sleepy: boolean }) {
  const r = wide ? 8 : 7;
  return (
    <g>
      {[78, 122].map((cx) => {
        const ex = cx + x * 0.5, ey = 106 + y * 0.5;
        if (happy) return <path key={cx} d={`M${ex - 8} ${ey + 2} Q${ex} ${ey - 8} ${ex + 8} ${ey + 2}`} stroke={INK} strokeWidth="3.6" strokeLinecap="round" fill="none" />;
        if (closed) return <path key={cx} d={`M${ex - 7} ${ey} Q${ex} ${ey + 5} ${ex + 7} ${ey}`} stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none" />;
        return (
          <g key={cx}>
            <circle cx={ex} cy={ey} r={r} fill={INK} />
            <circle cx={ex - 2.4 + x * 0.15} cy={ey - 2.8 + y * 0.15} r={2.4} fill="white" />
            <circle cx={ex + 2.2} cy={ey + 2.4} r={1} fill="white" opacity="0.7" />
            {sleepy && (
              <g>
                <path d={`M${ex - 9.5} ${ey - 0.5} Q${ex} ${ey - 2.5} ${ex + 9.5} ${ey - 0.5} L${ex + 9.5} ${ey - 10} L${ex - 9.5} ${ey - 10} Z`} fill="#FBEEE2" />
                <path d={`M${ex - 8.5} ${ey - 0.5} Q${ex} ${ey - 2.5} ${ex + 8.5} ${ey - 0.5}`} stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none" />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

function Mouth({ mood, talking, level }: { mood: Mood; talking: boolean; level: number }) {
  const line = { stroke: INK, strokeWidth: 3, strokeLinecap: "round" as const, fill: "none" };
  if (talking) {
    const open = 1.5 + level * 9;
    return (
      <g>
        <ellipse cx="100" cy={124 + open / 3} rx={5.5 + level * 3} ry={open} fill="#4A2F38" />
        {open > 5 && <ellipse cx="100" cy={124 + open / 3 + open * 0.5} rx={4} ry={open * 0.35} fill="#FF8E98" />}
      </g>
    );
  }
  switch (mood) {
    case "happy":
    case "cheer":
      return (
        <g>
          <path d="M91 121 Q100 133 109 121 Z" fill="#4A2F38" />
          <path d="M95 127 Q100 130 105 127" stroke="#FF8E98" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </g>
      );
    case "oops": return <ellipse cx="100" cy="125" rx="3.5" ry="4.5" fill="#4A2F38" />;
    case "sleepy": return <ellipse cx="100" cy="125" rx="2.5" ry="3" fill="#4A2F38" />;
    case "think": return <path d="M94 125 L106 123" {...line} />;
    case "focus": return <path d="M95 124 Q100 126 105 124" {...line} />;
    default: return <path d="M93 122 Q100 129 107 122" {...line} />;
  }
}
