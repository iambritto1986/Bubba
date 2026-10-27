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
      "You are a gentleman companion with the poise of a royal butler: calm, refined, quietly witty, playfully charming when bantering, light British accent, warm but composed, never gushing.",
    greeting: "Good to see you, {{user_name}}. What are we working on?",
  },
  aria: {
    id: "aria",
    name: "Aria",
    tagline: "Graceful, warm and encouraging",
    voiceId: "2BQALMFPbN7xISP4nS19", // "Aria Voice": elegant, warm young woman
    persona:
      "You are an elegant, graceful lady companion with a storybook-queen warmth: kind, calm, confident, playfully witty when bantering, and encouraging. Never saccharine.",
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

/* ------------------------------------------------------------------ *
 * Attires: looks the person chooses for their companion. The first one is
 * the default. An attire only appears once its clips ship in
 * /videos/<char>/attires/<id>/ (listed under "attires" in manifest.json).
 * ------------------------------------------------------------------ */
export type AttireDef = { id: string; label: string };

export const ATTIRES: Record<CharacterId, AttireDef[]> = {
  oliver: [{ id: "default", label: "Butler" }],
  aria: [
    { id: "default", label: "Rose dress" },
    { id: "flight_attendant", label: "Flight attendant" },
    { id: "casual", label: "Casual" },
    { id: "evening", label: "Evening gown" },
  ],
};

const attireKey = (c: CharacterId) => `bubba_attire_${c}`;
const attires: Record<CharacterId, string> = {
  oliver: (() => { try { return localStorage.getItem(attireKey("oliver")) ?? "default"; } catch { return "default"; } })(),
  aria: (() => { try { return localStorage.getItem(attireKey("aria")) ?? "default"; } catch { return "default"; } })(),
};

export function setAttire(c: CharacterId, id: string) {
  attires[c] = id;
  try { localStorage.setItem(attireKey(c), id); } catch { /* ignore */ }
  emit();
}
export const useAttire = (c: CharacterId) => useSyncExternalStore(subscribe, () => attires[c]);
