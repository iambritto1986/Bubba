import { isTauri } from "./env";

/**
 * Where the big character media lives.
 *
 * The character videos are hundreds of MB, far too big to embed in bubba.exe (Tauri bakes
 * everything in `dist/` into the binary, and compiling that ran out of memory). So the build
 * leaves `videos/` out of `dist/`, "Build and start Bubba.bat" copies it into a `media` folder
 * next to bubba.exe, and the app reads it from disk through Tauri's asset protocol.
 * In a plain browser (vite dev) it's still served from `/videos/...`.
 */

let base: string | null | undefined;      // undefined = not resolved yet, null = use web paths
let pending: Promise<void> | null = null;
let toUrl: ((p: string) => string) | null = null;

/** Resolve the media folder once (call before building any media URL; cheap after the first time). */
export function mediaReady(): Promise<void> {
  pending ??= (async () => {
    if (!isTauri) { base = null; return; }
    try {
      const { invoke, convertFileSrc } = await import("@tauri-apps/api/core");
      base = await invoke<string>("media_root");
      const sep = base.includes("\\") ? "\\" : "/";   // keep Windows paths all-backslash for the scope check
      toUrl = (p) => convertFileSrc(`${base}${sep}${p.split("/").join(sep)}`);
    } catch (e) {
      console.warn("media folder unavailable, falling back to bundled paths:", e);
      base = null;
    }
  })();
  return pending;
}

/** "videos/oliver/idle.webm" → a URL the webview can load. */
export function mediaUrl(path: string): string {
  const p = path.replace(/^\/+/, "");
  return base && toUrl ? toUrl(p) : `/${p}`;
}
