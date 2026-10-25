import { useCharacter, type CharacterId } from "../lib/characters";
import { Person } from "./characters/Person";
import { Plush } from "./characters/Plush";
import type { Mood } from "./characters/rig";

export type { Mood };

/**
 * The on-screen companion. Draws whichever character the user picked (Oliver or Aria);
 * the plush mascot stands in until they choose. Every character takes the same moods.
 */
export function Bubba({ mood, size = 180, character }: { mood: Mood; size?: number; character?: CharacterId | "plush" }) {
  const chosen = useCharacter();
  const id = character ?? chosen;
  if (id === "oliver" || id === "aria") return <Person variant={id} mood={mood} size={size} />;
  return <Plush mood={mood} size={size} />;
}
