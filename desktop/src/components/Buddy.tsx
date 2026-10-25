import { useEffect, useRef, useState } from "react";
import { useApi, type Profile } from "../lib/api";
import { CHARACTERS, getCharacter } from "../lib/characters";
import { chatActive, setChatTools, startChat, stopChat, tellBubba, useChat } from "../lib/conversation";
import { tuckAway } from "../lib/tuck";
import { fmt, usePomodoro } from "../lib/usePomodoro";
import { useSay } from "../lib/voice";
import type { Mood } from "./Bubba";
import { QuizCard } from "./QuizCard";
import { Btn, SpeechBubble } from "./SpeechBubble";
import { TimerRing } from "./TimerRing";

/** The main loop once Bubba knows who you are. */
export function Buddy({ profile, onMood }: { profile: Profile; onMood: (m: Mood) => void }) {
  const api = useApi();
  const chat = useChat();
  const p = usePomodoro(profile.focusMinutes, profile.breakMinutes);
  const [intention, setIntention] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [today, setToday] = useState<{ sessions: number; minutes: number } | null>(null);
  const name = profile.displayName ?? "friend";
  const talking = chat.status !== "off";

  const refreshToday = () => api<{ sessions: number; minutes: number }>("/api/sessions/today").then(setToday).catch(() => {});
  useEffect(() => { refreshToday(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (talking) onMood(chat.status === "connecting" ? "think" : "happy");
    else onMood({ idle: "happy", focus: "focus", "check-in": "cheer", break: "idle" }[p.phase] as Mood);
  }, [p.phase, talking, chat.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (opts: { intention?: string; minutes?: number } = {}) => {
    const what = (opts.intention ?? intention).trim();
    setIntention(what);
    p.startFocus(opts.minutes);
    const s = await api<{ id: string }>("/api/sessions", {
      method: "POST",
      body: { intention: what || undefined, plannedMinutes: opts.minutes && opts.minutes > 0 ? opts.minutes : profile.focusMinutes },
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

  // Tools Bubba can call while you talk to him. A ref keeps them reading the latest state.
  const live = useRef({ p, intention, today, start, finish, stopEarly });
  live.current = { p, intention, today, start, finish, stopEarly };
  useEffect(() => {
    setChatTools({
      start_focus: async ({ minutes, intention: what }) => {
        const l = live.current;
        if (l.p.phase === "focus") return "A focus session is already running.";
        await l.start({ intention: typeof what === "string" ? what : "", minutes: Number(minutes) || 0 });
        return `Started a ${Number(minutes) > 0 ? minutes : profile.focusMinutes}-minute focus session.`;
      },
      control_timer: async ({ action }) => {
        const l = live.current;
        switch (action) {
          case "pause": l.p.pause(); return "Paused.";
          case "resume": l.p.resume(); return "Resumed.";
          case "stop": await l.stopEarly(); return "Stopped the session.";
          case "finished": await l.finish(true); return "Recorded as done. Break started.";
          case "not_finished": await l.finish(false); return "Recorded as not finished. Break started.";
          case "start_break": l.p.startBreak(); return "Break started.";
          default: return "Unknown action.";
        }
      },
      tuck_away: () => {
        // Let his goodbye finish, then hang up and slip into the corner.
        window.setTimeout(() => { void stopChat(); void tuckAway(); }, 1800);
        return "Tucking away now.";
      },
      get_status: () => {
        const l = live.current;
        return JSON.stringify({
          state: l.p.phase,
          paused: l.p.paused,
          time_left: l.p.phase === "focus" || l.p.phase === "break" ? fmt(l.p.msLeft) : null,
          working_on: l.intention || null,
          sessions_today: l.today?.sessions ?? 0,
          focus_minutes_today: l.today?.minutes ?? 0,
        });
      },
    });
  }, [profile.focusMinutes]);

  // Keep Bubba in the loop when the timer changes on its own.
  const prevPhase = useRef(p.phase);
  useEffect(() => {
    if (prevPhase.current !== p.phase && chatActive()) {
      if (p.phase === "check-in") tellBubba(`The focus session just ended. Ask ${name} whether they finished${intention ? ` "${intention}"` : ""}.`);
      else if (p.phase === "idle" && prevPhase.current === "break") tellBubba("The break just ended.");
    }
    prevPhase.current = p.phase;
  }, [p.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTalk = () => {
    if (talking) return void stopChat();
    const who = CHARACTERS[getCharacter() ?? "oliver"];
    void startChat(
      async () => (await api<{ token: string }>("/api/voice/token", { method: "POST" })).token,
      {
        user_name: name,
        focus_minutes: profile.focusMinutes,
        timer_state: p.phase === "focus" ? `focus session running, ${fmt(p.msLeft)} left${p.paused ? " (paused)" : ""}` : p.phase,
        sessions_today: today?.sessions ?? 0,
        companion_name: who.name,
        persona: who.persona,
      },
      {
        voiceId: who.voiceId.endsWith("PENDING") ? undefined : who.voiceId,
        firstMessage: who.greeting.replace("{{user_name}}", name),
      },
    );
  };

  // The only scripted line left: a heads-up when the timer runs out and you're not already chatting.
  useSay(p.phase === "check-in" && !talking ? `Time's up, ${name}.` : undefined);

  return (
    <div className="flex w-full flex-col gap-2">
      {bubble()}
      <TalkBar status={chat.status} error={chat.error} onToggle={toggleTalk} />
    </div>
  );

  function bubble() {
    // While you're talking to him, the bubble is just his caption.
    if (talking && (p.phase === "idle" || p.phase === "check-in")) {
      return (
        <SpeechBubble id="chat">
          {chat.userLine && <p className="mb-1 text-xs font-semibold text-ink/50">“{chat.userLine}”</p>}
          <p className="text-sm font-semibold leading-snug">
            {chat.agentLine ?? (chat.status === "connecting" ? "One moment…" : "I'm listening.")}
          </p>
        </SpeechBubble>
      );
    }

    if (p.phase === "idle") {
      return (
        <SpeechBubble id="idle">
          <p className="text-sm font-semibold">
            {today?.sessions ? `${today.sessions} down today, ${name}. Another?` : `Ready when you are, ${name}.`}
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
            <Btn onClick={() => start()}>Let's go</Btn>
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
              {talking && chat.agentLine && <p className="mt-0.5 line-clamp-2 text-xs text-ink/60">{chat.agentLine}</p>}
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
            Time's up, {name}. {intention ? <>Did you finish <b>{intention}</b>?</> : "Did you get it done?"}
          </p>
          <div className="mt-2 flex justify-end gap-1.5">
            <Btn variant="soft" onClick={() => finish(false)}>Not yet</Btn>
            <Btn onClick={() => finish(true)}>Yes</Btn>
          </div>
        </SpeechBubble>
      );
    }

    return (
      <SpeechBubble id="break">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-mint">Break · quiz time</p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold tabular-nums text-ink/60">{fmt(p.msLeft)}</span>
            <button className="text-xs font-bold text-ink/50 hover:text-ink" onClick={p.stop}>Skip</button>
          </div>
        </div>
        <QuizCard onMood={onMood} />
      </SpeechBubble>
    );
  }
}

/** The mic: click to start talking to Bubba, click again to hang up. */
function TalkBar({ status, error, onToggle }: { status: string; error: string | null; onToggle: () => void }) {
  const on = status !== "off";
  const label = { off: `Talk to ${CHARACTERS[getCharacter() ?? "oliver"].name}`, connecting: "Connecting…", listening: "Listening — just talk", speaking: "Talking" }[status] ?? "";
  return (
    <div className="flex items-center justify-center gap-2">
      <button
        onClick={onToggle}
        title={on ? "End conversation" : label}
        className={`relative flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold shadow transition-[background-color,transform] active:scale-[0.97] ${
          on ? "bg-coral text-white" : "bg-hippo-dark text-white hover:bg-[#5f50b3]"
        }`}
      >
        {status === "listening" && <span className="absolute -left-1 -top-1 size-3 animate-ping rounded-full bg-mint" />}
        <span aria-hidden>{on ? "■" : "🎙"}</span>
        {on ? (status === "connecting" ? "Connecting…" : "End chat") : label}
      </button>
      {on && status !== "connecting" && <span className="text-xs font-semibold text-ink/60">{label}</span>}
      {!on && error && <span className="text-xs font-semibold text-coral">{error}</span>}
    </div>
  );
}
