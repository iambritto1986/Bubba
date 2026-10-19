import { useCallback, useEffect, useRef, useState } from "react";

export type Phase = "idle" | "focus" | "check-in" | "break";

/**
 * Pomodoro state machine: idle → focus → check-in ("did you finish?") → break → idle.
 * Time is tracked against an end timestamp so it stays correct if the window is hidden or the tab throttles.
 */
export function usePomodoro(focusMinutes: number, breakMinutes: number) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const total = useRef(0);

  useEffect(() => {
    if (endsAt === null) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [endsAt]);

  const msLeft = pausedLeft ?? (endsAt ? Math.max(0, endsAt - now) : 0);

  // Phase transitions when the clock runs out.
  useEffect(() => {
    if (endsAt === null || pausedLeft !== null || msLeft > 0) return;
    setEndsAt(null);
    if (phase === "focus") setPhase("check-in");
    else if (phase === "break") setPhase("idle");
  }, [msLeft, endsAt, pausedLeft, phase]);

  const run = (minutes: number, next: Phase) => {
    total.current = minutes * 60_000;
    setPausedLeft(null);
    setNow(Date.now());
    setEndsAt(Date.now() + total.current);
    setPhase(next);
  };

  return {
    phase,
    msLeft,
    progress: total.current ? 1 - msLeft / total.current : 0,
    paused: pausedLeft !== null,
    startFocus: useCallback(() => run(focusMinutes, "focus"), [focusMinutes]),
    startBreak: useCallback(() => run(breakMinutes, "break"), [breakMinutes]),
    pause: () => { if (endsAt) { setPausedLeft(Math.max(0, endsAt - Date.now())); setEndsAt(null); } },
    resume: () => { if (pausedLeft !== null) { setNow(Date.now()); setEndsAt(Date.now() + pausedLeft); setPausedLeft(null); } },
    stop: () => { setEndsAt(null); setPausedLeft(null); setPhase("idle"); },
  };
}

export const fmt = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
