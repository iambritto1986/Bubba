import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useApi, type QuizQuestion, type QuizResult } from "../lib/api";
import type { Mood } from "./Bubba";

/** Fetches one question from the API (Gemini) and lets the user answer it. */
export function QuizCard({ onMood }: { onMood: (m: Mood) => void }) {
  const api = useApi();
  const [q, setQ] = useState<QuizQuestion | null>(null);
  const [result, setResult] = useState<(QuizResult & { chosen: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setQ(null); setResult(null); setError(null); onMood("think");
    api<QuizQuestion>("/api/quiz", { method: "POST" })
      .then((d) => { setQ(d); onMood("idle"); })
      .catch((e: Error) => { setError(e.message); onMood("oops"); });
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = async (i: number) => {
    if (!q || result) return;
    const r = await api<QuizResult>(`/api/quiz/${q.id}/answer`, { method: "POST", body: { chosenIndex: i } });
    setResult({ ...r, chosen: i });
    onMood(r.correct ? "cheer" : "oops");
  };

  if (error) return (
    <p className="text-sm">
      Hmm, my brain's foggy: {error}{" "}
      <button className="font-bold text-hippo-dark underline" onClick={load}>Try again</button>
    </p>
  );
  if (!q) return <p className="text-sm font-semibold text-ink/70">Thinking of a good one…</p>;

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-hippo-dark/80">{q.topic}</p>
      <p className="text-sm font-bold leading-snug">{q.question}</p>
      <div className="grid gap-1.5">
        {q.choices.map((c, i) => {
          const state = !result ? "open" : i === result.correctIndex ? "right" : i === result.chosen ? "wrong" : "dim";
          return (
            <motion.button
              key={i}
              whileTap={!result ? { scale: 0.98 } : undefined}
              onClick={() => answer(i)}
              disabled={!!result}
              className={`rounded-xl px-3 py-1.5 text-left text-[13px] font-semibold transition-colors ${
                { open: "bg-hippo-belly/40 hover:bg-hippo-belly/80",
                  right: "bg-mint text-white",
                  wrong: "bg-coral text-white",
                  dim: "bg-ink/5 text-ink/40" }[state]
              }`}
            >
              {c}
            </motion.button>
          );
        })}
      </div>
      {result && (
        <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-[13px] leading-snug text-ink/80">
          <b>{result.correct ? "Nailed it! " : "Close! "}</b>{result.explanation}
        </motion.p>
      )}
      {result && (
        <button className="text-xs font-bold text-hippo-dark underline" onClick={load}>Another one</button>
      )}
    </div>
  );
}
