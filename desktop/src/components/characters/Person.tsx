import { motion } from "motion/react";
import { useId } from "react";
import { armMotion, bodyMotion, StatusFx, useLive, type Live, type Mood } from "./rig";

/**
 * A stylised, big-head caricature person (Oliver or Aria), drawn in SVG.
 * Shares the same live rig as every other character: blinks, follows the cursor,
 * perks up to listen, sways while thinking, and moves its mouth with the voice.
 */
type Variant = "oliver" | "aria";

const LOOK = {
  oliver: { skin: "#F2C9A8", skinShade: "#E3AE8A", hair: "#3A2A22", hairLight: "#5A4232", iris: "#6B4A2E", lip: "#B5655E", brow: "#3A2A22" },
  aria:   { skin: "#F7D6C1", skinShade: "#EBBBA0", hair: "#7A3B2A", hairLight: "#A0573F", iris: "#3F7A68", lip: "#C9566B", brow: "#6A3426" },
};
const INK = "#2a2230";

export function Person({ variant, mood, size }: { variant: Variant; mood: Mood; size: number }) {
  const l = useLive(mood);
  const c = LOOK[variant];
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = (n: string) => `${n}-${uid}`;
  const talkLift = l.talking ? l.level * 3 : 0;

  return (
    <motion.svg width={size} height={size * 1.1} viewBox="0 0 200 220" style={{ overflow: "visible" }}
      aria-label={`${variant === "oliver" ? "Oliver" : "Aria"} is ${l.listening ? "listening" : l.thinking ? "thinking" : l.talking ? "talking" : mood}`}>
      <defs>
        <radialGradient id={ref("face")} cx="45%" cy="40%" r="70%">
          <stop offset="0%" stopColor={c.skin} />
          <stop offset="100%" stopColor={c.skinShade} />
        </radialGradient>
        <linearGradient id={ref("coat")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34457A" />
          <stop offset="100%" stopColor="#222D52" />
        </linearGradient>
        <linearGradient id={ref("gown")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E7A6B3" />
          <stop offset="100%" stopColor="#C97A8E" />
        </linearGradient>
        <linearGradient id={ref("hair")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.hairLight} />
          <stop offset="100%" stopColor={c.hair} />
        </linearGradient>
      </defs>

      <ellipse cx="100" cy="212" rx="52" ry="5.5" fill={INK} opacity={0.13} />

      <motion.g animate={bodyMotion(l, { squash: false })} style={{ originX: 0.5, originY: 1 }}>
        {variant === "aria" && <AriaBackHair fill={`url(#${ref("hair")})`} />}

        {variant === "oliver" ? <OliverBody l={l} coat={`url(#${ref("coat")})`} /> : <AriaBody l={l} gown={`url(#${ref("gown")})`} skin={c.skin} />}

        {/* neck + head (head bobs a touch with the voice) */}
        <rect x="91" y="116" width="18" height="20" rx="6" fill={c.skinShade} />
        <motion.g animate={{ rotate: l.listening ? l.gaze.x * 4 : l.thinking ? -4 : 0, y: -talkLift }}
          transition={{ type: "spring", stiffness: 200, damping: 16 }} style={{ originX: 0.5, originY: 1 }}>
          <ellipse cx="55" cy="86" rx="6" ry="9" fill={c.skinShade} />
          <ellipse cx="145" cy="86" rx="6" ry="9" fill={c.skinShade} />
          <path d="M56 78 C56 48 76 33 100 33 C124 33 144 48 144 78 C144 106 126 126 100 127 C74 126 56 106 56 78 Z" fill={`url(#${ref("face")})`} />
          <Face l={l} c={c} lashes={variant === "aria"} />
          {variant === "oliver" ? <OliverHair fill={`url(#${ref("hair")})`} shine={c.hairLight} /> : <AriaFrontHair fill={`url(#${ref("hair")})`} />}
        </motion.g>

        <StatusFx l={l} x={160} y={30} />
      </motion.g>
    </motion.svg>
  );
}

function Face({ l, c, lashes }: { l: Live; c: (typeof LOOK)["aria"]; lashes: boolean }) {
  const ix = Math.max(-2.6, Math.min(2.6, l.look.x * 0.4));
  const iy = Math.max(-2.2, Math.min(2.2, l.look.y * 0.4));
  const browLift = l.listening || l.thinking ? -3 : l.mood === "oops" ? -4 : 0;
  const focus = l.mood === "focus";
  const closed = l.asleep || l.blink;

  return (
    <g>
      {/* blush */}
      <ellipse cx="73" cy="104" rx="8.5" ry="5" fill="#FF8E98" opacity={l.cheering || l.talking ? 0.5 : 0.35} />
      <ellipse cx="127" cy="104" rx="8.5" ry="5" fill="#FF8E98" opacity={l.cheering || l.talking ? 0.5 : 0.35} />

      {/* brows */}
      <motion.g animate={{ y: browLift }} transition={{ type: "spring", stiffness: 260, damping: 16 }}
        stroke={c.brow} strokeWidth={lashes ? 2.4 : 3.6} strokeLinecap="round" fill="none">
        <path d={focus ? "M73 74 Q81 73 90 77" : lashes ? "M73 74 Q81 68 90 72" : "M72 74 Q81 70 90 73"} />
        <path d={focus ? "M127 74 Q119 73 110 77" : lashes ? "M127 74 Q119 68 110 72" : "M128 74 Q119 70 110 73"} />
      </motion.g>

      {/* eyes */}
      {[82, 118].map((cx, i) => {
        const side = i === 0 ? -1 : 1;
        if (l.cheering) return <path key={cx} d={`M${cx - 8} ${90} Q${cx} ${81} ${cx + 8} ${90}`} stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />;
        if (closed) return (
          <g key={cx}>
            <path d={`M${cx - 8} 88 Q${cx} 93 ${cx + 8} 88`} stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />
            {lashes && <path d={`M${cx + side * 8} 88 l ${side * 3} -1`} stroke={INK} strokeWidth="2" strokeLinecap="round" />}
          </g>
        );
        return (
          <g key={cx}>
            <ellipse cx={cx} cy="88" rx="8" ry={l.listening ? 9.5 : 9} fill="white" />
            <circle cx={cx + ix} cy={89 + iy} r="6" fill={c.iris} />
            <circle cx={cx + ix} cy={89 + iy} r="3" fill={INK} />
            <circle cx={cx + ix - 2} cy={86.5 + iy} r="1.8" fill="white" />
            <circle cx={cx + ix + 2} cy={91 + iy} r="0.9" fill="white" opacity="0.8" />
            {focus && <path d={`M${cx - 9} 79 L${cx + 9} 79 L${cx + 9} 86 Q${cx} 84 ${cx - 9} 86 Z`} fill={c.skin} />}
            {/* upper lid / lashes */}
            <path d={focus ? `M${cx - 8.5} 86 Q${cx} 84 ${cx + 8.5} 86` : `M${cx - 8.5} 86 Q${cx} 77.5 ${cx + 8.5} 86`}
              stroke={INK} strokeWidth={lashes ? 2.8 : 1.8} strokeLinecap="round" fill="none" />
            {lashes && <path d={`M${cx + side * 8.2} 84.5 l ${side * 3.5} -2.5`} stroke={INK} strokeWidth="2" strokeLinecap="round" />}
          </g>
        );
      })}

      {/* nose */}
      <path d="M97 101 Q100 104.5 103 101" stroke={c.skinShade} strokeWidth="2.2" strokeLinecap="round" fill="none" />

      <Mouth l={l} lip={c.lip} />
    </g>
  );
}

function Mouth({ l, lip }: { l: Live; lip: string }) {
  const line = { stroke: lip, strokeWidth: 2.6, strokeLinecap: "round" as const, fill: "none" };
  if (l.talking) {
    const open = 1.5 + l.level * 7.5;
    return (
      <g>
        <ellipse cx="100" cy={112 + open / 3} rx={6 + l.level * 2.5} ry={open} fill="#5A2F38" />
        {open > 4 && <path d={`M${94 + l.level} ${112 + open / 3 - open * 0.75} h ${12 - l.level * 2}`} stroke="white" strokeWidth={Math.min(2.5, open * 0.4)} strokeLinecap="round" />}
        {open > 5 && <ellipse cx="100" cy={112 + open / 3 + open * 0.5} rx="4" ry={open * 0.3} fill="#E77B8A" />}
      </g>
    );
  }
  switch (l.mood) {
    case "happy":
    case "cheer":
      return (
        <g>
          <path d="M90 110 Q100 122 110 110 Z" fill="#5A2F38" />
          <path d="M92.5 110.5 h15" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      );
    case "oops": return <ellipse cx="100" cy="114" rx="3.5" ry="4.5" fill="#5A2F38" />;
    case "sleepy": return <ellipse cx="100" cy="114" rx="2.5" ry="3" fill="#5A2F38" />;
    case "think": return <path d="M94 114 Q100 112 106 113" {...line} />;
    case "focus": return <path d="M94 113 Q100 115 106 113" {...line} />;
    default: return <path d="M92 111 Q100 118 108 111" {...line} />;
  }
}

/* ---------- Oliver: gentleman with a butler's poise (and a hint of prince) ---------- */

function OliverHair({ fill, shine }: { fill: string; shine: string }) {
  return (
    <g>
      <path d="M53 86 C48 44 74 26 101 26 C129 26 152 44 147 86 C145 70 139 60 129 53 C113 63 86 61 69 51 C61 59 55 70 53 86 Z" fill={fill} />
      <path d="M69 51 C80 30 116 27 134 44 C118 38 96 40 82 52 Z" fill={shine} opacity="0.55" />
      <path d="M53 86 L56 98 L59 84 Z M147 86 L144 98 L141 84 Z" fill={fill} />
    </g>
  );
}

function OliverBody({ l, coat }: { l: Live; coat: string }) {
  return (
    <g>
      <ellipse cx="88" cy="208" rx="10" ry="5" fill="#1D1B24" />
      <ellipse cx="112" cy="208" rx="10" ry="5" fill="#1D1B24" />
      {/* tailcoat */}
      <path d="M66 140 Q100 128 134 140 L142 204 Q100 211 58 204 Z" fill={coat} />
      {/* shirt + lapels */}
      <path d="M87 132 L100 162 L113 132 Z" fill="#F7F5F0" />
      <path d="M87 132 L100 163 L79 149 Z" fill="#1B2445" />
      <path d="M113 132 L100 163 L121 149 Z" fill="#1B2445" />
      {/* bow tie */}
      <path d="M100 138 L89 132 L89 144 Z M100 138 L111 132 L111 144 Z" fill="#7B2D3A" />
      <circle cx="100" cy="138" r="2.8" fill="#5E1F2B" />
      {/* gold buttons + epaulettes */}
      <circle cx="100" cy="174" r="2.6" fill="#E2B85A" />
      <circle cx="100" cy="188" r="2.6" fill="#E2B85A" />
      <rect x="62" y="137" width="16" height="6" rx="3" fill="#E2B85A" />
      <rect x="122" y="137" width="16" height="6" rx="3" fill="#E2B85A" />
      <path d="M118 150 l6 -2 l1 6 Z" fill="#F7F5F0" opacity="0.9" />
      {/* arms, in front of the coat */}
      {([-1, 1] as const).map((s) => (
        <motion.g key={s} animate={armMotion(l, s, 4)} style={{ originX: s === -1 ? 1 : 0, originY: 0 }}>
          <path d={s === -1 ? "M66 142 Q54 160 56 186 L68 188 Q68 166 76 150 Z" : "M134 142 Q146 160 144 186 L132 188 Q132 166 124 150 Z"} fill={coat} />
          <circle cx={s === -1 ? 62 : 138} cy="190" r="7" fill="#F4F1EA" />
        </motion.g>
      ))}
    </g>
  );
}

/* ---------- Aria: graceful lady ---------- */

function AriaBackHair({ fill }: { fill: string }) {
  return <path d="M54 82 C48 40 76 26 101 26 C127 26 153 40 147 82 C152 112 158 142 151 172 C141 180 128 174 124 162 L124 112 L76 112 L76 162 C72 174 59 180 49 172 C42 142 49 112 54 82 Z" fill={fill} />;
}

function AriaFrontHair({ fill }: { fill: string }) {
  return (
    <g>
      <path d="M55 84 C51 44 77 28 103 28 C129 28 150 46 145 84 C141 64 131 53 117 48 C104 60 84 64 66 58 C60 66 56 74 55 84 Z" fill={fill} />
      {/* side locks framing the face */}
      <path d="M56 80 C50 100 52 122 60 134 C62 118 60 100 64 84 Z" fill={fill} />
      <path d="M144 80 C150 100 148 122 140 134 C138 118 140 100 136 84 Z" fill={fill} />
      {/* pearl hair pin */}
      <circle cx="128" cy="52" r="3.4" fill="#FBF6EE" />
      <circle cx="134" cy="56" r="2.6" fill="#FBF6EE" />
      <circle cx="129" cy="59" r="2.2" fill="#FBF6EE" />
    </g>
  );
}

function AriaBody({ l, gown, skin }: { l: Live; gown: string; skin: string }) {
  return (
    <g>
      {/* shoulders + gown */}
      <path d="M68 142 Q100 128 132 142 L130 152 Q100 146 70 152 Z" fill={skin} />
      <path d="M70 150 Q100 144 130 150 L133 166 Q150 190 157 206 Q100 216 43 206 Q50 190 67 166 Z" fill={gown} />
      <path d="M70 150 Q85 156 100 150 Q115 156 130 150" stroke="#F6D3DB" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M68 166 Q100 172 132 166" stroke="#F6D3DB" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M82 180 Q78 196 74 206 M118 180 Q122 196 126 206" stroke="#B9687D" strokeWidth="1.6" fill="none" opacity="0.6" />
      {/* pearl necklace */}
      {[-12, -6, 0, 6, 12].map((dx) => (
        <circle key={dx} cx={100 + dx} cy={137 + Math.abs(dx) * -0.12 + (dx === 0 ? 2 : 1)} r="1.8" fill="#FBF6EE" />
      ))}
      {([-1, 1] as const).map((s) => (
        <motion.g key={s} animate={armMotion(l, s, 4)} style={{ originX: s === -1 ? 1 : 0, originY: 0 }}>
          <path d={s === -1 ? "M68 146 Q58 164 60 184 L69 185 Q70 166 76 152 Z" : "M132 146 Q142 164 140 184 L131 185 Q130 166 124 152 Z"} fill={skin} />
          <circle cx={s === -1 ? 64 : 136} cy="186" r="5.5" fill={skin} />
          <ellipse cx={s === -1 ? 70 : 130} cy="146" rx="9" ry="7" fill="#EDB6C2" />
        </motion.g>
      ))}
    </g>
  );
}
