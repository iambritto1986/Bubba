import { useSyncExternalStore } from "react";
import { isTauri } from "./env";

export type WalkState = { walking: boolean; dir: -1 | 1 };
let walkState: WalkState = { walking: false, dir: 1 };
const walkListeners = new Set<() => void>();
function setWalk(next: WalkState) {
  if (walkState.walking === next.walking && walkState.dir === next.dir) return;
  walkState = next;
  walkListeners.forEach((l) => l());
}
export const useWalkState = () =>
  useSyncExternalStore((l) => { walkListeners.add(l); return () => walkListeners.delete(l); }, () => walkState);

/** Small helpers over the Tauri window so the same UI also runs in a plain browser tab. */
export async function setWindowSize(width: number, height: number, center = false) {
  if (!isTauri) return;
  const { getCurrentWindow, LogicalSize, PhysicalPosition, currentMonitor } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  await win.setSize(new LogicalSize(width, height));
  if (center) {
    await win.center();
  } else {
    const monitor = await currentMonitor();
    if (monitor) {
      const size = await win.outerSize();
      const area = monitor.workArea;
      const margin = Math.round(24 * monitor.scaleFactor);
      const x = area.position.x + area.size.width - size.width - margin;
      const y = area.position.y + area.size.height - size.height - margin;
      await win.setPosition(new PhysicalPosition(x, y));
    }
  }
}

let walkAbort = 0;

/**
 * Walk Bubba across the taskbar to the corner (`"right"` or `"left"`), driving `useWalkState()`
 * while interpolating the Tauri window position so he physically strolls over before sitting down.
 */
export async function walkWindowToCorner(corner: "right" | "left" = "right", flushToTaskbar = false) {
  const token = ++walkAbort;
  if (!isTauri) {
    setWalk({ walking: true, dir: corner === "right" ? 1 : -1 });
    await new Promise((r) => setTimeout(r, 900));
    if (walkAbort === token) setWalk({ walking: false, dir: 1 });
    return;
  }

  try {
    const { getCurrentWindow, PhysicalPosition, currentMonitor } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const monitor = await currentMonitor();
    if (!monitor) return;
    const [startPos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
    const area = monitor.workArea;
    const scale = monitor.scaleFactor;
    const marginX = Math.round(16 * scale);
    const marginY = flushToTaskbar ? 0 : Math.round(12 * scale);

    const targetX = corner === "right"
      ? area.position.x + area.size.width - size.width - marginX
      : area.position.x + marginX;
    const targetY = area.position.y + area.size.height - size.height - marginY;

    const dx = targetX - startPos.x;
    const dy = targetY - startPos.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 28 * scale) {
      await win.setPosition(new PhysicalPosition(targetX, targetY));
      return;
    }

    const dir: -1 | 1 = dx >= 0 ? 1 : -1;
    setWalk({ walking: true, dir });
    const durationMs = Math.min(2800, Math.max(650, (dist / (220 * scale)) * 1000));
    const t0 = performance.now();

    await new Promise<void>((resolve) => {
      const step = async () => {
        if (walkAbort !== token) { resolve(); return; }
        const u = Math.min(1, (performance.now() - t0) / durationMs);
        const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const x = Math.round(startPos.x + dx * ease);
        const y = Math.round(startPos.y + dy * ease);
        await win.setPosition(new PhysicalPosition(x, y)).catch(() => {});
        if (u < 1) requestAnimationFrame(() => void step());
        else resolve();
      };
      requestAnimationFrame(() => void step());
    });
  } finally {
    if (walkAbort === token) setWalk({ walking: false, dir: 1 });
  }
}

export async function startDrag() {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

/** Minimise to the taskbar (click Bubba's taskbar button to bring him back). */
export async function minimizeWindow() {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().minimize();
}

export async function hideWindow() {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().hide();
}

export const SIZES = {
  buddy: { width: 340, height: 500 },
  signIn: { width: 500, height: 700 },
} as const;
