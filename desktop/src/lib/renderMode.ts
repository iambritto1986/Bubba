import { useSyncExternalStore } from "react";

/** How the companion is drawn: pre-rendered Pixar-style video clips, or the real-time Three.js 3D model. */
export type RenderMode = "video" | "3d";

const KEY = "bubba_render";
let mode: RenderMode = (() => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "3d" || v === "video") return v;
    if (localStorage.getItem("bubba_video") === "0") return "3d"; // older toggle
  } catch { /* ignore */ }
  return "video";
})();
const listeners = new Set<() => void>();

export function setRenderMode(m: RenderMode) {
  mode = m;
  try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
export const useRenderMode = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => mode);
