import { useSyncExternalStore } from "react";
import { isTauri } from "./env";
import { SIZES, setWindowSize } from "./windowCtl";

/**
 * "Tucked away": Bubba shrinks into the bottom-right corner with just his head peeking up.
 * Everything else (timer, chat state) keeps running underneath. Click him to bring him back.
 */
export const PEEK = { width: 120, height: 96 } as const;

let tucked = false;
const listeners = new Set<() => void>();
const set = (v: boolean) => { tucked = v; listeners.forEach((l) => l()); };
export const useTucked = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => tucked);
export const isTucked = () => tucked;

export async function tuckAway() {
  if (tucked) return;
  set(true);
  if (!isTauri) return;
  const { getCurrentWindow, LogicalSize, PhysicalPosition, currentMonitor } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  await win.setSize(new LogicalSize(PEEK.width, PEEK.height));
  const monitor = await currentMonitor();
  if (monitor) {
    const size = await win.outerSize();
    const area = monitor.workArea;
    // Flush against the taskbar, a little in from the right edge.
    const x = area.position.x + area.size.width - size.width - Math.round(16 * monitor.scaleFactor);
    const y = area.position.y + area.size.height - size.height;
    await win.setPosition(new PhysicalPosition(x, y));
  }
}

export async function bringBack() {
  if (!tucked) return;
  set(false);
  await setWindowSize(SIZES.buddy.width, SIZES.buddy.height);
}
