import { dismissReminder, dueReminders, snoozeReminder, useAgenda } from "../lib/agenda";
import { Btn, SpeechBubble } from "./SpeechBubble";

/** Due reminders, above Bubba's usual bubble, until you tick them off or snooze them. */
export function ReminderBubble() {
  const due = dueReminders(useAgenda());
  if (due.length === 0) return null;
  const r = due[0];
  return (
    <SpeechBubble id={`reminder-${r.id}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-coral">⏰ Reminder{due.length > 1 ? ` (${due.length})` : ""}</p>
      <p className="mt-0.5 text-sm font-semibold leading-snug">{r.text}</p>
      <div className="mt-2 flex justify-end gap-1.5">
        <Btn variant="soft" onClick={() => snoozeReminder(r.id, 10)}>Snooze 10 min</Btn>
        <Btn onClick={() => dismissReminder(r.id)}>Done</Btn>
      </div>
    </SpeechBubble>
  );
}
