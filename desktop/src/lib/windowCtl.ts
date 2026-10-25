import { isTauri } from "./env";

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

export async function startDrag() {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
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
