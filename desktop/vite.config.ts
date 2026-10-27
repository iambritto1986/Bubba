import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The character videos (hundreds of MB) must NOT end up in dist/: Tauri embeds dist/ into
 * bubba.exe and rustc runs out of memory. "Build and start Bubba.bat" copies public/videos into
 * a `media` folder beside the exe instead (see src/lib/media.ts). Dev mode still serves them.
 */
const keepVideosOutOfExe = () => ({
  name: "keep-videos-out-of-exe",
  apply: "build" as const,
  closeBundle() {
    rmSync(resolve(__dirname, "dist/videos"), { recursive: true, force: true });
  },
});

// Tauri expects a fixed dev port.
export default defineConfig({
  plugins: [react(), tailwindcss(), keepVideosOutOfExe()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  build: { target: "es2022" },
});
