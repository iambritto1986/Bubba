/**
 * One-off character moments ("quirks"): a bow, a wave, adjusting a bow tie or cap, a safety demo...
 * Any part of the app can ask the on-screen companion to perform one; the 3D character decides
 * whether it's a sensible moment (it never interrupts talking or listening).
 */
export type QuirkName =
  | "wave"
  | "greet"     // Oliver bows, Aria does her welcoming bow
  | "shrug"
  | "fidget"    // a small idle habit (bow tie / cap / fringe)
  | "focus"     // getting ready for a focus session (bow tie / safety demo)
  | `quirk_${string}`; // or a clip name straight from the GLB

type Listener = (q: QuirkName) => void;
const listeners = new Set<Listener>();

export function playQuirk(q: QuirkName) {
  listeners.forEach((l) => l(q));
}

export function onQuirk(l: Listener) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
