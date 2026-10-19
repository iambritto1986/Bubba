import { useEffect, useState } from "react";
import { useApi, type Profile } from "../lib/api";
import { fmt, usePomodoro } from "../lib/usePomodoro";
import type { Mood } from "./Bubba";
import { QuizCard } from "./QuizCard";
import { Btn, SpeechBubble } from "./SpeechBubble";
import { TimerRing } from "./TimerRing";

/** The main loop once Bubba knows who you are. */
export function Buddy({ profile, onMood }: { profile: Profile; onMood: (m: Mood) => void }) {
  const api = useApi();
  const p = usePomodoro(profile.focusMinutes, profile.breakMinutes);
  const [intention, setIntention] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [today, setToday] = useState<{ sessions: number; minutes: number } | null>(null);
  const name = profile.displayName ?? "friend";

  const refreshToday = () => api<{ sessions: number; minutes: number }>("/api/sessions/today").then(setToday).catch(() => {});
  useEffect(() => { refreshToday(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onMood({ idle: "happy", focus: "focus", "check-in": "cheer", break: "idle" }[p.phase] as Mood);
  }, [p.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    p.startFocus();
    const s = await api<{ id: string }>("/api/sessions", {
      method: "POST",
      body: { intention: intention.trim() || undefined, plannedMinutes: profile.focusMinutes },
    }).catch(() => null);
    setSessionId(s?.id ?? null);
  };

  const finish = async (completed: boolean) => {
    if (sessionId) await api(`/api/sessions/${sessionId}`, { method: "PATCH", body: { completed } }).catch(() => {});
    setSessionId(null);
    setIntention("");
    refreshToday();
    p.startBreak();
  };

  const stopEarly = async () => {
    if (sessionId) await api(`/api/sessions/${sessionId}`, { method: "PATCH", body: { completed: false } }).catch(() => {});
    setSessionId(null);
    p.stop();
  };

  if (p.phase === "idle") {
    return (
      <SpeechBubble id="idle">
        <p className="text-sm font-semibold">
          {today?.sessions ? `${today.sessions} down today, ${name}! Another?` : `Ready to focus, ${name}?`}
        </p>
        <input
          value={intention}
          maxLength={200}
          onChange={(e) => setIntention(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
          placeholder="What are you working on?"
          className="mt-2 w-full rounded-xl bg-white px-3 py-1.5 text-sm outline-none ring-2 ring-hippo-belly focus:ring-hippo"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-ink/50">{profile.focusMinutes} min focus · {profile.breakMinutes} min break</span>
          <Btn onClick={start}>Let's go</Btn>
        </div>
      </SpeechBubble>
    );
  }

  if (p.phase === "focus") {
    return (
      <SpeechBubble id="focus">
        <div className="flex items-center gap-3">
          <TimerRing msLeft={p.msLeft} progress={p.progress} color="var(--color-hippo-dark)" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-ink/50">{p.paused ? "Paused" : "Focusing"}</p>
            <p className="truncate text-sm font-semibold">{intention || "Deep work"}</p>
            <div className="mt-1 flex gap-1">
              {p.paused ? <Btn variant="soft" onClick={p.resume}>Resume</Btn> : <Btn variant="soft" onClick={p.pause}>Pause</Btn>}
              <Btn variant="ghost" onClick={stopEarly}>Stop</Btn>
            </div>
          </div>
        </div>
      </SpeechBubble>
    );
  }

  if (p.phase === "check-in") {
    return (
      <SpeechBubble id="check-in">
        <p className="text-sm font-semibold">
          Time's up, {name}! {intention ? <>Did you finish <b>{intention}</b>?</> : "Did you get it done?"}
        </p>
        <div className="mt-2 flex justify-end gap-1.5">
          <Btn variant="soft" onClick={() => finish(false)}>Not yet</Btn>
          <Btn onClick={() => finish(true)}>Yes!</Btn>
        </div>
      </SpeechBubble>
    );
  }

  // break
  return (
    <SpeechBubble id="break">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-mint">Break · quiz time</p>
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold tabular-nums text-ink/60">
            {fmt(p.msLeft)}
          </span>
          <button className="text-xs font-bold text-ink/50 hover:text-ink" onClick={p.stop}>Skip</button>
        </div>
      </div>
      <QuizCard onMood={onMood} />
    </SpeechBubble>
  );
}
