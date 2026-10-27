/**
 * Live mouth shapes ("visemes") from the companion's voice.
 *
 * Whoever is playing his voice pushes the current frequency spectrum here, ~60 times a second:
 *   - the live chat (ElevenLabs Conversation.getOutputByteFrequencyData), and
 *   - one-off lines (`say()`, via our own Web Audio analyser).
 * Both use the ElevenLabs SDK convention: bins spread linearly over the 100–8000 Hz voice range.
 *
 * From loudness + where the energy sits we pick one of 8 mouth shapes, the same set as the
 * sprite sheet: rest, mbp (m/b/p), aa (ah), eh (eh/s/t), ee, oh, oo (oo/w), fv (f/v).
 * It's a fast heuristic (no speech recognition), tuned to read naturally at small sizes:
 * jaw opening follows loudness, lip shape follows brightness of the sound, and each shape
 * is held for a few frames so the mouth never flickers.
 */

export type Viseme = "rest" | "mbp" | "aa" | "eh" | "ee" | "oh" | "oo" | "fv";

const MIN_HZ = 100;
const MAX_HZ = 8000;

let current: Viseme = "rest";
let heldSince = 0;
let lastLoudAt = 0;
let smoothed = 0;
let lastPush = 0;

function band(bins: ArrayLike<number>, lo: number, hi: number) {
  const n = bins.length;
  const a = Math.max(0, Math.floor(((lo - MIN_HZ) / (MAX_HZ - MIN_HZ)) * n));
  const b = Math.min(n, Math.ceil(((hi - MIN_HZ) / (MAX_HZ - MIN_HZ)) * n));
  let s = 0;
  for (let i = a; i < b; i++) s += bins[i];
  return b > a ? s / (b - a) : 0;
}

function pick(level: number, bins: ArrayLike<number>, now: number): Viseme {
  if (level < 0.06) {
    // a short closed-lip beat right after a sound reads like m/b/p; then relax
    return now - lastLoudAt < 90 ? "mbp" : "rest";
  }
  lastLoudAt = now;
  const low = band(bins, 150, 700);    // jaw-open vowels (F1)
  const mid = band(bins, 700, 1800);   // a / o colour
  const high = band(bins, 1800, 4000); // i / e brightness (F2)
  const sib = band(bins, 4000, 8000);  // s, f, sh, t
  const total = low + mid + high + sib + 1;

  if (sib / total > 0.3) return level < 0.25 ? "fv" : "eh";
  const bright = (high + 0.5 * mid) / (low + 1);
  if (bright > 1.05) return level > 0.5 ? "eh" : "ee";
  if (bright < 0.42) return level > 0.38 ? "oh" : "oo";
  return level > 0.42 ? "aa" : "eh";
}

/** Feed one analysis frame. `level` is 0..1 loudness; `bins` the voice-range spectrum. */
export function pushMouthFrame(level: number, bins: ArrayLike<number> | null) {
  const now = performance.now();
  lastPush = now;
  smoothed += (level - smoothed) * 0.5;
  const next = bins ? pick(smoothed, bins, now) : smoothed > 0.06 ? (smoothed > 0.42 ? "aa" : "eh") : "rest";
  // hold each shape ≥ 70 ms (closing to rest is allowed a little sooner)
  const hold = next === "rest" ? 50 : 70;
  if (next !== current && now - heldSince >= hold) {
    current = next;
    heldSince = now;
  }
}

/** The mouth shape to draw right now ("rest" when nothing has been pushed recently). */
export function getViseme(): Viseme {
  if (performance.now() - lastPush > 200) current = "rest";
  return current;
}

/** Resample a raw analyser spectrum (0..sampleRate/2) into the 100–8000 Hz voice range. */
export function voiceRange(raw: Uint8Array, sampleRate: number, out: Uint8Array) {
  const hzPerBin = sampleRate / 2 / raw.length;
  const minBin = Math.floor(MIN_HZ / hzPerBin);
  const maxBin = Math.min(Math.ceil(MAX_HZ / hzPerBin), raw.length);
  const count = maxBin - minBin;
  for (let i = 0; i < out.length; i++) {
    const pos = (i / out.length) * count;
    const lo = minBin + Math.floor(pos);
    const hi = Math.min(lo + 1, maxBin - 1);
    const t = pos - Math.floor(pos);
    out[i] = Math.round(raw[lo] * (1 - t) + raw[hi] * t);
  }
  return out;
}
