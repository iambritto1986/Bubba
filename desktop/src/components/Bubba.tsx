import { lazy, Suspense } from "react";
import { useCharacter, type CharacterId } from "../lib/characters";
import type { Framing } from "./characters/Character3D";
import CharacterVideo from "./characters/CharacterVideo";
import { Person } from "./characters/Person";
import { Plush } from "./characters/Plush";
import type { Mood } from "./characters/rig";
import { useRenderMode } from "../lib/renderMode";

export type { Mood };

// Load Three.js only on demand if a character falls back from Path 1 video to 3D.
const Character3D = lazy(() => import("./characters/Character3D"));


/** 3D fallback mode (set localStorage bubba_3d = "0" to force 2D SVG). */
function is3DEnabled() {
  try {
    if (localStorage.getItem("bubba_3d") === "0") return false;
  } catch { /* ignore */ }
  return typeof window !== "undefined" && !!window.WebGLRenderingContext;
}

/**
 * The on-screen companion.
 * Priority:
 *  1. Path 1 Pixar-style Anchor-Locked Transparent Video (`CharacterVideo`) when `/videos/<id>/manifest.json` exists
 *  2. Rigged 3D GLB (`Character3D`) if video assets aren't present for that character yet
 *  3. 2D SVG (`Person`) while loading or when WebGL is disabled
 */
export function Bubba({
  mood, size = 180, character, framing, walking, facing,
}: {
  mood: Mood;
  size?: number;
  character?: CharacterId | "plush";
  /** How much of the character to show in 3D fallback; small sizes default to bust. */
  framing?: Framing;
  walking?: boolean;
  facing?: number;
}) {
  const chosen = useCharacter();
  const renderMode = useRenderMode();
  const id = character ?? chosen;
  if (id === "oliver" || id === "aria") {
    const flat = <Person variant={id} mood={mood} size={size} />;
    const fallbackChar = is3DEnabled() ? (
      <Suspense fallback={flat}>
        <Character3D
          variant={id}
          mood={mood}
          size={size}
          framing={framing ?? (size < 130 ? "bust" : "body")}
          walking={walking}
          facing={facing}
        />
      </Suspense>
    ) : (
      flat
    );

    if (renderMode === "video") {
      return (
        <CharacterVideo
          variant={id}
          mood={mood}
          size={size}
          framing={framing ?? (size < 130 ? "bust" : "body")}
          walking={walking}
          facing={facing}
          fallback={fallbackChar}
        />
      );
    }
    return fallbackChar;
  }
  return <Plush mood={mood} size={size} />;
}
