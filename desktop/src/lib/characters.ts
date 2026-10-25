import { useSyncExternalStore } from "react";

/**
 * The companions you can pick. "One brain, many skins": they share the same voice agent, tools and
 * animation states; each brings its own look, voice and personality.
 */
export type CharacterId = "oliver" | "aria";

export type CharacterDef = {
  id: CharacterId;
  name: string;
  tagline: string;
  voiceId: string;
  persona: string;
  greeting: string;
};

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  oliver: {
    id: "oliver",
    name: "Oliver",
    tagline: "A gentleman with a butler's poise",
    voiceId: "hRbsi7Sgd2GnL8siHYj9", // "Bubba Voice": calm British gentleman
    persona:
      "You are a gentleman companion with the poise of a royal butler: calm, refined, quietly witty, light British accent, warm but composed, never gushing.",
    greeting: "Good to see you, {{user_name}}. What are we working on?",
  },
  aria: {
    id: "aria",
    name: "Aria",
    tagline: "Graceful, warm and encouraging",
    voiceId: "2BQALMFPbN7xISP4nS19", // "Aria Voice": elegant, warm young woman
    persona:
      "You are an elegant, graceful lady companion with a storybook-queen warmth: kind, calm, confident and encouraging, with a gentle sense of humour. Never saccharine.",
    greeting: "Hello, {{user_name}}. What shall we work on today?",
  },
};

export const isCharacterId = (v: unknown): v is CharacterId => v === "oliver" || v === "aria";

const KEY = "bubba_character";
let current: CharacterId | null = (() => {
  try { const v = localStorage.getItem(KEY); return isCharacterId(v) ? v : null; } catch { return null; }
})();
let picking = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function setCharacter(id: CharacterId) {
  current = id;
  picking = false;
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  emit();
}
export const getCharacter = () => current;
export const useCharacter = () => useSyncExternalStore(subscribe, () => current);

/** Show the "choose your companion" screen again (from the toolbar). */
export function setPicking(v: boolean) { picking = v; emit(); }
export const usePicking = () => useSyncExternalStore(subscribe, () => picking);
