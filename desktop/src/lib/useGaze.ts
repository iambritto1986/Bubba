import { useEffect, useState } from "react";
import { isTauri } from "./env";

/**
 * Where Bubba should look: a direction from him toward the mouse, each axis in -1..1.
 * In the desktop app it follows the cursor anywhere on screen; in a browser tab, within the page.
 */
export function useGaze() {
  const [gaze, setGaze] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const aim = (dx: number, dy: number, reach: number) => {
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / reach);
      setGaze((g) => {
        const n = { x: (dx / d) * k, y: (dy / d) * k };
        return Math.abs(n.x - g.x) + Math.abs(n.y - g.y) < 0.04 ? g : n;
      });
    };

    if (!isTauri) {
      const onMove = (e: MouseEvent) => aim(e.clientX - window.innerWidth / 2, e.clientY - (window.innerHeight - 110), 400);
      window.addEventListener("mousemove", onMove);
      return () => window.removeEventListener("mousemove", onMove);
    }

    let stop = false;
    let timer = 0;
    (async () => {
      const { getCurrentWindow, cursorPosition } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const tick = async () => {
        if (stop) return;
        try {
          const [cur, pos, size, scale] = await Promise.all([cursorPosition(), win.outerPosition(), win.outerSize(), win.scaleFactor()]);
          const cx = pos.x + size.width / 2;
          const cy = pos.y + size.height - 110 * scale; // roughly his face
          aim(cur.x - cx, cur.y - cy, 500 * scale);
        } catch { /* permissions or window gone: just keep looking ahead */ }
        timer = window.setTimeout(tick, 90);
      };
      tick();
    })();
    return () => { stop = true; window.clearTimeout(timer); };
  }, []);

  return gaze;
}
