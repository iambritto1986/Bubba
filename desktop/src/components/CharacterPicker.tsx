import { motion } from "motion/react";
import { CHARACTERS, type CharacterId } from "../lib/characters";
import { Bubba } from "./Bubba";
import { Btn, SpeechBubble } from "./SpeechBubble";

/** First step for new users (and the "switch companion" button): pick who keeps you company. */
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
            </motion.button>
          );
        })}
      </div>
      {onCancel && <div className="mt-2 flex justify-end"><Btn variant="ghost" onClick={onCancel}>Keep current</Btn></div>}
    </SpeechBubble>
  );
}
