/**
 * Oliver's own life. When nobody is talking to him he isn't a screensaver: he keeps a daily
 * routine by the PC's local clock — a workout and coffee in the morning, tidying and reading
 * through the day, cooking and lunch around noon, tea in the afternoon, the paper in the
 * evening, and at night he nods off on his ledge until the wake word (or a click) rouses him.
 *
 * Each block is a weighted pool of clip names; the director only picks clips that actually
 * shipped, so new clips can be listed here before they exist. Add to it freely.
 */

export type Block = {
  name: string;
  /** local hour range [from, to) */
  from: number;
  to: number;
  /** activities he picks from, with weights */
  pool: [string, number][];
  /** while idle in this block he sits on his ledge and loops these instead of standing */
  rest?: string[];
};

// Little things that suit any time of day (mixed into every waking block at low weight).
const ANYTIME: [string, number][] = [
  ["bowtie", 2],
  ["pocket_watch", 2],
  ["idle_look_around", 2],
  ["idle_stroll", 2],
  ["idle_stretch", 1],
  ["wink", 0.5],
  ["pocket_hankies", 0.6],
  ["prop_umbrella", 0.5],
  ["dance_twirl", 0.3],
];

export const ROUTINE: Block[] = [
  { name: "morning", from: 6, to: 9, pool: [["life_jumping_jacks", 4], ["life_pushups", 3], ["prop_dumbbells", 3], ["prop_coffee", 4], ["idle_stretch", 3], ["prop_newspaper", 2]] },
  { name: "work", from: 9, to: 12, pool: [["prop_notebook", 3], ["pocket_pencil", 2], ["prop_book", 2], ["prop_duster", 3], ["idle_shoes", 2], ["prop_magnifier", 1.5], ["prop_coffee", 1.5], ["pocket_scroll", 1]] },
  { name: "lunch", from: 12, to: 14, pool: [["life_cooking", 5], ["life_eating", 5], ["prop_water", 3], ["prop_tea", 1]] },
  { name: "afternoon", from: 14, to: 18, pool: [["prop_tea", 4], ["prop_book", 2], ["life_watering", 3], ["prop_duster", 2], ["prop_magnifier", 1.5], ["prop_water", 2], ["prop_dumbbells", 1], ["dance_jig", 0.5]] },
  { name: "evening", from: 18, to: 21, pool: [["prop_newspaper", 3], ["life_cooking", 2], ["life_eating", 2], ["prop_book", 3], ["prop_tea", 2], ["dance_twirl", 0.8], ["yawn", 1]] },
  { name: "late", from: 21, to: 23, pool: [["yawn", 3], ["life_doze_stand", 4], ["prop_book", 2], ["prop_tea", 1]] },
  // night: asleep on the ledge
  { name: "night", from: 23, to: 6, pool: [["life_doze_stand", 1]], rest: ["sit_sleep", "sitting_focus"] },
];

export function blockAt(d = new Date()): Block {
  const h = d.getHours();
  return ROUTINE.find((b) => (b.from < b.to ? h >= b.from && h < b.to : h >= b.from || h < b.to)) ?? ROUTINE[1];
}

/** The activity pool for right now (block pool + anytime habits, unless he's asleep). */
export function routinePool(d = new Date()): [string, number][] {
  const b = blockAt(d);
  return b.rest ? b.pool : [...b.pool, ...ANYTIME];
}

/** Clips he loops while resting at this hour, or null if he should be up and about. */
export function restClips(d = new Date()): string[] | null {
  return blockAt(d).rest ?? null;
}

/** What he's up to, for the agent's get_status ("I was just making lunch"). */
export function routineSummary(d = new Date()): string {
  const n = blockAt(d).name;
  return {
    morning: "doing his morning exercises and having a coffee",
    work: "tidying up, reading and taking notes",
    lunch: "cooking and having lunch",
    afternoon: "having afternoon tea and watering the plants",
    evening: "reading the evening paper",
    late: "winding down for the night, a bit sleepy",
    night: "asleep on his ledge",
  }[n] ?? "pottering about";
}
