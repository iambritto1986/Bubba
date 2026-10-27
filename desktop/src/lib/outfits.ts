import { useSyncExternalStore } from "react";

/**
 * Outfits: the companion changes clothes to suit the conversation.
 *  - "default"  → his everyday look (Oliver's butler tailcoat)
 *  - "listener" → soft cardigan, for "I had a bad day" / "can we talk?"
 *  - "coach"    → athletic wear, for gym / workout / running talk
 *  - "chef"     → apron, for cooking / meal talk
 *  - "scholar"  → reading glasses & sweater vest, for study / exams
 *
 * An outfit only takes effect if its clips exist (`/videos/<char>/outfits/<name>/`),
 * so new outfits can ship one at a time. The video director plays the change animation.
 */
export const OUTFITS = ["default", "listener", "coach", "chef", "scholar"] as const;
export type OutfitName = (typeof OUTFITS)[number];

export const isOutfitName = (v: unknown): v is OutfitName =>
  typeof v === "string" && (OUTFITS as readonly string[]).includes(v);

let outfit: OutfitName = "default";
let revertTimer = 0;
const listeners = new Set<() => void>();

export function setOutfit(next: OutfitName) {
  window.clearTimeout(revertTimer);
  if (next === outfit) return;
  outfit = next;
  listeners.forEach((l) => l());
}

export const getOutfit = () => outfit;

export const useOutfit = () =>
  useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => outfit,
  );

/** After a conversation ends, slip back into everyday clothes (unless a new one starts). */
export function scheduleOutfitRevert(ms = 120_000) {
  window.clearTimeout(revertTimer);
  if (outfit === "default") return;
  revertTimer = window.setTimeout(() => setOutfit("default"), ms);
}

export function cancelOutfitRevert() {
  window.clearTimeout(revertTimer);
}

/** What the person just said → which outfit fits the moment (null = keep the current one). */
export function inferOutfitFromText(text: string): OutfitName | null {
  const s = text.toLowerCase();
  if (/\b(bad day|rough day|hard day|need to talk|can we talk|vent|feeling (down|low|sad|lonely|anxious|stressed|overwhelmed)|i'?m (sad|lonely|anxious|stressed|overwhelmed|struggling|not okay|not ok)|heart ?broken|break ?up|broke up)\b/.test(s)) {
    return "listener";
  }
  if (/\b(gym|work ?out|exercise|lifting|weights|dumbbells?|go(ing)? (for a )?run|running|jogging|cardio|push-?ups|squats|yoga|stretch(ing)?)\b/.test(s)) {
    return "coach";
  }
  if (/\b(cook(ing)?|recipe|dinner|lunch|breakfast|meal ?prep|bake|baking|kitchen)\b/.test(s)) {
    return "chef";
  }
  if (/\b(study|studying|exam|homework|revision|revise|lecture|thesis|essay|assignment)\b/.test(s)) {
    return "scholar";
  }
  return null;
}
