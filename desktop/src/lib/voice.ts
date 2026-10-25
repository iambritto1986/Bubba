import { useEffect, useSyncExternalStore } from "react";
import { API_URL } from "./env";

/**
 * Bubba's voice: fetches a line from /api/speak (ElevenLabs on the server), plays it,
 * and publishes a 0..1 loudness level so Bubba's mouth can move with the audio.
 * Plain module state (no React context) so any component can make Bubba talk.
 */

type TokenGetter = () => Promise<string | null>;
let getToken: TokenGetter | null = null;
export function setVoiceTokenGetter(fn: TokenGetter | null) { getToken = fn; }

const MUTE_KEY = "bubba_muted";
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; } })();
let level = 0;
let speaking = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

const urls = new Map<string, Promise<string | null>>();
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let current: HTMLAudioElement | null = null;
let raf = 0;
let lastText = "";
let lastAt = 0;
let pending: HTMLAudioElement | null = null;
let disabled = false; // server says voice isn't configured → stay quiet

function fetchLine(text: string): Promise<string | null> {
  let p = urls.get(text);
  if (!p) {
    p = (async () => {
      const token = await getToken?.();
      if (!token) return null;
      const res = await fetch(`${API_URL}/api/speak`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      if (res.status === 503) disabled = true;
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    })().catch(() => null);
    p.then((u) => { if (!u) urls.delete(text); });
    urls.set(text, p);
  }
  return p;
}

function setLevel(v: number, s: boolean) {
  if (Math.abs(v - level) < 0.03 && s === speaking) return;
  level = v; speaking = s; emit();
}

function meter() {
  if (!analyser || !current || current.paused) { setLevel(0, false); return; }
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (const b of buf) { const x = (b - 128) / 128; sum += x * x; }
  const rms = Math.sqrt(sum / buf.length);
  setLevel(Math.min(1, rms * 5), true);
  raf = requestAnimationFrame(meter);
}

export function stopSpeaking() {
  cancelAnimationFrame(raf);
  current?.pause();
  current = null;
  pending = null;
  setLevel(0, false);
}

async function play(audio: HTMLAudioElement) {
  try {
    ctx ??= new AudioContext();
    if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.connect(ctx.destination); }
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    ctx.createMediaElementSource(audio).connect(analyser);
  } catch { /* no Web Audio: still plays, mouth just won't move */ }
  try {
    await audio.play();
    raf = requestAnimationFrame(meter);
  } catch {
    // Autoplay blocked until the user interacts once: replay on the next click.
    pending = audio;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => {
    const a = pending; pending = null;
    if (a && a === current) void play(a);
  }, true);
}

/** Make Bubba say a line. Interrupts whatever he was saying. */
export async function say(text: string | null | undefined) {
  const line = text?.replace(/\s+/g, " ").trim();
  if (!line || muted || disabled) return;
  const now = Date.now();
  if (line === lastText && now - lastAt < 2000) return; // StrictMode double-mount / re-renders
  lastText = line; lastAt = now;
  stopSpeaking();
  const url = await fetchLine(line);
  if (!url || line !== lastText || muted) return; // a newer line won the race
  const audio = new Audio(url);
  audio.crossOrigin = "anonymous";
  audio.onended = () => { if (current === audio) stopSpeaking(); };
  current = audio;
  await play(audio);
}

export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch { /* ignore */ }
  if (m) stopSpeaking();
  emit();
}

export const useVoiceLevel = () => useSyncExternalStore(subscribe, () => level);
export const useSpeaking = () => useSyncExternalStore(subscribe, () => speaking);
export const useMuted = () => useSyncExternalStore(subscribe, () => muted);

/** Say `text` whenever it changes (pass undefined to stay quiet). */
export function useSay(text: string | null | undefined) {
  useEffect(() => { void say(text); }, [text]);
}
