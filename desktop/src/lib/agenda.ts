import { useSyncExternalStore } from "react";

/**
 * Tasks, reminders and notes, kept on this PC (localStorage in the app's WebView, nothing leaves
 * the machine). The voice agent manages them through client tools; reminders fire on their own
 * and Bubba announces them (see ReminderBubble + Buddy).
 */

export type Task = { id: string; title: string; due?: string; done: boolean; created: number };
export type Reminder = { id: string; text: string; at: number; fired: boolean };
export type Note = { id: string; text: string; created: number };
type Agenda = { tasks: Task[]; reminders: Reminder[]; notes: Note[] };

const KEY = "bubba_agenda_v1";
let state: Agenda = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Agenda;
  } catch { /* ignore */ }
  return { tasks: [], reminders: [], notes: [] };
})();
const listeners = new Set<() => void>();
function commit(next: Agenda) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useAgenda = () => useSyncExternalStore(subscribe, () => state);
export const getAgenda = () => state;

const id = () => Math.random().toString(36).slice(2, 9);
const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, "").trim();

/** Find the item whose text best matches what the person said ("the invoice one"). */
function match<T extends { id: string }>(items: T[], text: (t: T) => string, q: string): T | undefined {
  const nq = norm(q);
  if (!nq) return undefined;
  return (
    items.find((i) => i.id === q) ??
    items.find((i) => norm(text(i)) === nq) ??
    items.find((i) => norm(text(i)).includes(nq)) ??
    items.find((i) => nq.split(/\s+/).every((w) => norm(text(i)).includes(w)))
  );
}

/* ---------------- tasks ---------------- */

export function addTask(title: string, due?: string) {
  const t = title.trim();
  if (!t) return "What's the task?";
  commit({ ...state, tasks: [...state.tasks, { id: id(), title: t, due: due?.trim() || undefined, done: false, created: Date.now() }] });
  return `Added "${t}" to your list${due ? ` (due ${due})` : ""}.`;
}

export function listTasks() {
  const open = state.tasks.filter((t) => !t.done);
  if (open.length === 0) return "Your list is clear.";
  return `${open.length} open: ` + open.map((t, i) => `${i + 1}. ${t.title}${t.due ? ` (due ${t.due})` : ""}`).join("; ");
}

export function completeTask(q: string) {
  const open = state.tasks.filter((t) => !t.done);
  const n = Number(q);
  const t = Number.isInteger(n) && n >= 1 && n <= open.length ? open[n - 1] : match(open, (x) => x.title, q);
  if (!t) return `I couldn't find "${q}" on your list.`;
  commit({ ...state, tasks: state.tasks.map((x) => (x.id === t.id ? { ...x, done: true } : x)) });
  const left = open.length - 1;
  return `Ticked off "${t.title}". ${left === 0 ? "That's everything!" : `${left} to go.`}`;
}

export function removeTask(q: string) {
  const t = match(state.tasks, (x) => x.title, q);
  if (!t) return `I couldn't find "${q}".`;
  commit({ ...state, tasks: state.tasks.filter((x) => x.id !== t.id) });
  return `Removed "${t.title}".`;
}

/* ---------------- reminders ---------------- */

/** "15" minutes, "3pm", "3:30 pm", "15:45", or an ISO date-time → epoch ms (today, or tomorrow if past). */
export function parseWhen(inMinutes?: unknown, at?: unknown): number | null {
  const mins = Number(inMinutes);
  if (Number.isFinite(mins) && mins > 0) return Date.now() + mins * 60_000;
  if (typeof at !== "string" || !at.trim()) return null;
  const s = at.trim().toLowerCase();
  const iso = Date.parse(s);
  if (!Number.isNaN(iso) && /\d{4}-\d{2}-\d{2}/.test(s)) return iso;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

const clock = (ms: number) => {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? t : `${d.toLocaleDateString([], { weekday: "long" })} ${t}`;
};

export function addReminder(text: string, inMinutes?: unknown, at?: unknown) {
  const t = text.trim();
  if (!t) return "What should I remind you about?";
  const when = parseWhen(inMinutes, at);
  if (!when) return "When? Give me minutes from now or a time like 3:30 pm.";
  commit({ ...state, reminders: [...state.reminders, { id: id(), text: t, at: when, fired: false }] });
  schedule();
  return `I'll remind you to ${t} at ${clock(when)}.`;
}

export function listReminders() {
  const up = state.reminders.filter((r) => !r.fired).sort((a, b) => a.at - b.at);
  if (up.length === 0) return "No reminders set.";
  return up.map((r) => `${clock(r.at)}: ${r.text}`).join("; ");
}

export function cancelReminder(q: string) {
  const r = match(state.reminders.filter((x) => !x.fired), (x) => x.text, q);
  if (!r) return `I couldn't find a reminder about "${q}".`;
  commit({ ...state, reminders: state.reminders.filter((x) => x.id !== r.id) });
  return `Cancelled the reminder to ${r.text}.`;
}

export function snoozeReminder(rid: string, minutes = 10) {
  commit({
    ...state,
    reminders: state.reminders.map((r) => (r.id === rid ? { ...r, at: Date.now() + minutes * 60_000, fired: false } : r)),
  });
  schedule();
}

export function dismissReminder(rid: string) {
  commit({ ...state, reminders: state.reminders.filter((r) => r.id !== rid) });
}

/** Reminders that are due and not yet acknowledged (the bubble shows these). */
export const dueReminders = (a: Agenda) => a.reminders.filter((r) => r.fired);

type DueListener = (r: Reminder) => void;
const dueListeners = new Set<DueListener>();
/** Called once when a reminder comes due (Buddy uses it to speak + react). */
export function onReminderDue(l: DueListener) { dueListeners.add(l); return () => { dueListeners.delete(l); }; }

let timer = 0;
function schedule() {
  window.clearTimeout(timer);
  const now = Date.now();
  const due = state.reminders.filter((r) => !r.fired && r.at <= now + 500);
  if (due.length) {
    commit({ ...state, reminders: state.reminders.map((r) => (due.some((d) => d.id === r.id) ? { ...r, fired: true } : r)) });
    due.forEach((r) => dueListeners.forEach((l) => l(r)));
  }
  const next = state.reminders.filter((r) => !r.fired).sort((a, b) => a.at - b.at)[0];
  // re-check at the next due time (capped, so sleep/clock changes are picked up)
  timer = window.setTimeout(schedule, next ? Math.min(Math.max(next.at - Date.now(), 250), 60_000) : 60_000);
}
if (typeof window !== "undefined") window.setTimeout(schedule, 1500);

/* ---------------- notes ---------------- */

export function addNote(text: string) {
  const t = text.trim();
  if (!t) return "What should I note down?";
  commit({ ...state, notes: [...state.notes, { id: id(), text: t, created: Date.now() }] });
  return "Noted.";
}

export function findNotes(query?: string) {
  const q = norm(query ?? "");
  const hits = (q ? state.notes.filter((n) => q.split(/\s+/).every((w) => norm(n.text).includes(w))) : state.notes).slice(-10);
  if (hits.length === 0) return q ? `No notes about "${query}".` : "You don't have any notes yet.";
  return hits.map((n) => `(${new Date(n.created).toLocaleDateString()}) ${n.text}`).join("\n");
}

export function deleteNote(q: string) {
  const n = match(state.notes, (x) => x.text, q);
  if (!n) return `I couldn't find a note like "${q}".`;
  commit({ ...state, notes: state.notes.filter((x) => x.id !== n.id) });
  return "Deleted that note.";
}
