import { useSyncExternalStore } from "react";
import type { Model } from "vosk-browser";

/**
 * "Hey Oliver" / "Hey Aria" — wake word detection that runs 100% on this PC ($0/hr).
 *
 * Uses Vosk (offline Kaldi speech recognition compiled to WebAssembly) with a tiny grammar so it
 * only ever tries to hear the companions' names; everything else falls into "[unk]". Audio never
 * leaves the machine. The listener releases the microphone while a voice chat is open (the chat
 * needs it) and picks it back up afterwards.
 *
 * Model: /models/vosk/model.tar.gz (vosk-model-small-en-us, ~40 MB, Apache-2.0), fetched once by
 * "Get wake word model.bat".
 */

export type WakeStatus = "off" | "loading" | "listening" | "paused" | "unavailable" | "error";

const MODEL_URL = "/models/vosk/model.tar.gz";
const KEY = "bubba_wakeword";
const PHRASES = ["hey oliver", "hey aria", "oliver", "aria", "[unk]"];

let enabled = (() => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } })();
let status: WakeStatus = "off";
let paused = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (s: WakeStatus) => { status = s; emit(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useWakeStatus = () => useSyncExternalStore(subscribe, () => status);
export const useWakeEnabled = () => useSyncExternalStore(subscribe, () => enabled);

type WakeListener = (name: "oliver" | "aria") => void;
const wakeListeners = new Set<WakeListener>();
export function onWake(l: WakeListener) { wakeListeners.add(l); return () => { wakeListeners.delete(l); }; }

let model: Model | null = null;
let modelPromise: Promise<Model | null> | null = null;
let recognizer: InstanceType<Model["KaldiRecognizer"]> | null = null;
let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let node: ScriptProcessorNode | null = null;
let lastWake = 0;

async function loadModel(): Promise<Model | null> {
  if (model) return model;
  modelPromise ??= (async () => {
    // is the model shipped with the app?
    const head = await fetch(MODEL_URL, { method: "HEAD" }).catch(() => null);
    if (!head?.ok) return null;
    const { createModel } = await import("vosk-browser");
    model = await createModel(MODEL_URL, -1);
    return model;
  })().catch((e) => { console.error("wake word model:", e); modelPromise = null; return null; });
  return modelPromise;
}

function heard(text: string) {
  const t = ` ${text.toLowerCase()} `;
  const now = Date.now();
  if (now - lastWake < 3000) return;
  const who = t.includes(" hey oliver ") ? "oliver" : t.includes(" hey aria ") ? "aria" : null;
  if (!who) return;
  lastWake = now;
  wakeListeners.forEach((l) => l(who));
}

async function startMic() {
  if (node || paused || !enabled) return;
  set("loading");
  const m = await loadModel();
  if (!m) return set("unavailable");
  if (paused || !enabled) return set(paused ? "paused" : "off");
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    ctx = new AudioContext();
    recognizer = new m.KaldiRecognizer(ctx.sampleRate, JSON.stringify(PHRASES));
    recognizer.on("partialresult", (msg) => {
      if ("result" in msg && msg.result && "partial" in msg.result) heard(msg.result.partial);
    });
    recognizer.on("result", (msg) => {
      if ("result" in msg && msg.result && "text" in msg.result) heard(msg.result.text);
    });
    const src = ctx.createMediaStreamSource(stream);
    node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => {
      try { recognizer?.acceptWaveform(e.inputBuffer); } catch { /* ignore a dropped chunk */ }
    };
    src.connect(node);
    node.connect(ctx.destination); // ScriptProcessor only runs when connected; it outputs silence
    set("listening");
  } catch (e) {
    console.error("wake word mic:", e);
    stopMic();
    set("error");
  }
}

function stopMic() {
  node?.disconnect();
  node = null;
  try { recognizer?.remove(); } catch { /* ignore */ }
  recognizer = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  void ctx?.close().catch(() => {});
  ctx = null;
}

/** Turn wake word listening on/off (remembered). */
export function setWakeEnabled(on: boolean) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* ignore */ }
  if (on) void startMic();
  else { stopMic(); set("off"); }
  emit();
}

/** Release the mic while a voice chat runs (call with false afterwards to listen again). */
export function pauseWake(p: boolean) {
  paused = p;
  if (p) { stopMic(); if (enabled) set("paused"); }
  else if (enabled) void startMic();
}

/** Start listening if the user has it enabled (called once the app is signed in). */
export function initWake() {
  if (enabled) void startMic();
}
