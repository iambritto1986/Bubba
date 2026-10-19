import { fmt } from "../lib/usePomodoro";

export function TimerRing({ msLeft, progress, color }: { msLeft: number; progress: number; color: string }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-16 place-items-center">
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-ink/10" />
        <circle
          cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - progress)}
          style={{ transition: "stroke-dashoffset 250ms linear" }}
        />
      </svg>
      <span className="text-sm font-extrabold tabular-nums text-ink">{fmt(msLeft)}</span>
    </div>
  );
}
