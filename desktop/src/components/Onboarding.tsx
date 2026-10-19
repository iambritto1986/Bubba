import { useState } from "react";
import { Btn, SpeechBubble } from "./SpeechBubble";

/** First run: Bubba introduces himself and asks what to call you. */
export function Onboarding({ suggested, onSave }: { suggested?: string; onSave: (name: string) => Promise<void> }) {
  const [step, setStep] = useState<"hello" | "name">("hello");
  const [name, setName] = useState(suggested ?? "");
  const [saving, setSaving] = useState(false);

  if (step === "hello") {
    return (
      <SpeechBubble id="hello">
        <p className="text-sm font-semibold leading-snug">
          Hi there! I'm <b>Bubba</b>. I'll keep you company while you focus, and quiz you on your breaks so your brain stays fresh.
        </p>
        <div className="mt-2 flex justify-end"><Btn onClick={() => setStep("name")}>Nice to meet you!</Btn></div>
      </SpeechBubble>
    );
  }

  return (
    <SpeechBubble id="name">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setSaving(true);
          await onSave(name.trim()).finally(() => setSaving(false));
        }}
      >
        <p className="text-sm font-semibold">What should I call you?</p>
        <input
          autoFocus
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="mt-2 w-full rounded-xl bg-white px-3 py-1.5 text-sm font-semibold outline-none ring-2 ring-hippo-belly focus:ring-hippo"
        />
        <div className="mt-2 flex justify-end"><Btn type="submit" disabled={saving || !name.trim()}>That's me</Btn></div>
      </form>
    </SpeechBubble>
  );
}
