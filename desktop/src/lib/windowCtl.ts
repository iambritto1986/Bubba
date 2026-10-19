import { isTauri } from "./env";

/** Small helpers over the Tauri window so the same UI also runs in a plain browser tab. */
export async function setWindowSize(width: number, height: number) {
  if (!isTauri) return;
  const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setSize(new LogicalSize(width, height));
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
  signIn: { width: 440, height: 680 },
} as const;
