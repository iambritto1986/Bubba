import { activeWindow, type ActiveWindow } from "./skills";

/**
 * Screen awareness, cheap-first: every 20 s we read the foreground window's title and app name
 * (a local Windows call, no screenshots, nothing leaves the PC). That powers:
 *  - gentle "drifting?" nudges during a focus session, and
 *  - `get_screen_context` when the person asks Oliver about what they're doing.
 */

type Sample = ActiveWindow & { t: number };
const history: Sample[] = [];
const POLL_MS = 20_000;

const DISTRACTIONS: [RegExp, string][] = [
  [/youtube/i, "YouTube"],
  [/netflix/i, "Netflix"],
  [/reddit/i, "Reddit"],
  [/tiktok/i, "TikTok"],
  [/instagram/i, "Instagram"],
  [/facebook/i, "Facebook"],
  [/(^|\W)(x\.com|twitter)(\W|$)/i, "X"],
  [/twitch/i, "Twitch"],
  [/prime video|disney\+|hulu|max\b/i, "a streaming site"],
  [/9gag|imgur|buzzfeed/i, "the internet"],
  [/steam|epic games|roblox|minecraft|fortnite|valorant|league of legends/i, "a game"],
];

/** Is this window a likely distraction (unless it's what they said they're working on)? */
export function distractionName(w: ActiveWindow, intention = ""): string | null {
  const text = `${w.title} ${w.app}`;
  for (const [re, name] of DISTRACTIONS) {
    if (re.test(text) && !re.test(intention)) return name;
  }
  return null;
}

let timer = 0;
let focusOn = false;
let focusIntention = "";
let driftSince = 0;
let lastNudge = 0;
type NudgeListener = (what: string) => void;
const nudgeListeners = new Set<NudgeListener>();

/** Fires when they've been on a distraction for a while during focus (Buddy speaks the nudge). */
export function onDrift(l: NudgeListener) { nudgeListeners.add(l); return () => { nudgeListeners.delete(l); }; }

/** Tell the watcher whether a focus session is running (and what it's for). */
export function setFocusContext(on: boolean, intention = "") {
  focusOn = on;
  focusIntention = intention;
  driftSince = 0;
}

async function poll() {
  try {
    const w = await activeWindow();
    const now = Date.now();
    if (w.title || w.app) {
      const last = history[history.length - 1];
      if (!last || last.title !== w.title || last.app !== w.app) history.push({ ...w, t: now });
      if (history.length > 60) history.shift();
    }
    // Bubba's own window being focused isn't drifting
    const isSelf = /bubba/i.test(w.app) || /^bubba$/i.test(w.title);
    const what = focusOn && !isSelf ? distractionName(w, focusIntention) : null;
    if (what) {
      driftSince ||= now;
      const driftedFor = now - driftSince;
      if (driftedFor >= 60_000 && now - lastNudge > 5 * 60_000) {
        lastNudge = now;
        nudgeListeners.forEach((l) => l(what));
      }
    } else {
      driftSince = 0;
    }
  } catch { /* not in the desktop app */ }
  timer = window.setTimeout(poll, POLL_MS);
}

export function startScreenWatch() {
  if (timer) return;
  timer = window.setTimeout(poll, 3000);
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m <= 0 ? "just now" : `${m} min ago`;
};

/** A short, private summary for the agent: current window + the last few switches. */
export async function screenContext(): Promise<string> {
  const now = await activeWindow().catch(() => ({ title: "", app: "" }));
  const recent = history
    .filter((h) => Date.now() - h.t < 45 * 60_000)
    .slice(-8)
    .reverse()
    .map((h) => `${h.app.replace(/\.exe$/i, "")}: "${h.title.slice(0, 80)}" (${ago(h.t)})`);
  return JSON.stringify({
    now: { app: now.app.replace(/\.exe$/i, ""), title: now.title.slice(0, 120) },
    recent_windows: recent,
    focus_session_running: focusOn,
    focus_intention: focusIntention || null,
  });
}
