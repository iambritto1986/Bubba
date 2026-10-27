import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { ATTIRES, CHARACTERS, setAttire, useAttire, type CharacterId } from "../lib/characters";
import { Bubba } from "./Bubba";
import { loadManifest } from "./characters/CharacterVideo";
import { Btn, SpeechBubble } from "./SpeechBubble";

/** Attires whose clips have actually shipped for this character (the default is always there). */
function useAvailableAttires(id: CharacterId) {
  const [ids, setIds] = useState<string[]>(["default"]);
  useEffect(() => {
    let alive = true;
    loadManifest(id).then((m) => {
      if (!alive) return;
      const shipped = Object.entries(m?.attires ?? {}).filter(([, a]) => a.clips.length > 0).map(([k]) => k);
      setIds(["default", ...shipped]);
    });
    return () => { alive = false; };
  }, [id]);
  return ATTIRES[id].filter((a) => ids.includes(a.id));
}

function AttireChips({ id }: { id: CharacterId }) {
  const options = useAvailableAttires(id);
  const current = useAttire(id);
  if (options.length < 2) return null;
  return (
    <div className="mt-1.5 flex flex-wrap justify-center gap-1">
      {options.map((a) => (
        <span
          key={a.id}
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); setAttire(id, a.id); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setAttire(id, a.id); } }}
          className={`cursor-pointer rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
            current === a.id ? "bg-hippo text-cream" : "bg-cream/80 text-ink/70 hover:text-ink"
          }`}
        >
          {a.label}
        </span>
      ))}
    </div>
  );
}

/** First step for new users (and the "switch companion" button): pick who keeps you company, and their look. */
export function CharacterPicker({ onPick, onCancel }: { onPick: (id: CharacterId) => void; onCancel?: () => void }) {
  return (
    <SpeechBubble id="pick">
      <p className="text-sm font-bold">Choose your companion</p>
      <p className="text-xs font-semibold text-ink/55">You can switch any time.</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(Object.keys(CHARACTERS) as CharacterId[]).map((id) => {
          const c = CHARACTERS[id];
          return (
            <motion.button
              key={id}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onPick(id)}
              className="flex flex-col items-center rounded-2xl bg-hippo-belly/35 px-2 pb-2 pt-1 ring-2 ring-transparent transition-[box-shadow,background-color] hover:bg-hippo-belly/60 hover:ring-hippo"
            >
              <Bubba character={id} mood="happy" size={92} />
              <span className="mt-1 text-sm font-extrabold">{c.name}</span>
              <span className="text-[11px] font-semibold leading-tight text-ink/60">{c.tagline}</span>
              <AttireChips id={id} />
            </motion.button>
          );
        })}
      </div>
      {onCancel && <div className="mt-2 flex justify-end"><Btn variant="ghost" onClick={onCancel}>Keep current</Btn></div>}
    </SpeechBubble>
  );
}
