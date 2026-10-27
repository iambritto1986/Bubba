/**
 * Character expressions & reactions for Bubba's Pixar-style video state machine
 * (and bridged to 3D quirks when running the 3D fallback).
 */

export const REACTIONS = [
  "flirty_wink",     // cheeky double-eyebrow raise + wink + half-smirk
  "cheeky_smirk",    // amused head tilt, single raised brow, playful grin
  "warm_laugh",      // genuine shoulder chuckle, crinkly warm eyes
  "flattered",       // charmed subtle look-away + warm smile
  "gentleman_bow",   // hand over heart, polite royal butler bow
  "proud_cheer",     // celebratory applause + beaming grin
  "sympathetic",     // soft brows, warm reassuring nod
  "surprised",       // eyebrows shoot up, slight lean back
  "caught_you",      // arms crossed / raised-brow playful disapproval sigh
  "sleepy_yawn",     // gentle late-night / resting yawn
  "nod",             // warm firm nod — "quite right"
  "head_shake",      // polite apologetic head shake
  "wave",            // friendly little wave hello / goodbye
  "after_you",       // gracious sweeping "after you" / "here you go"
  "check_watch",     // glances at his pocket watch
  "fix_bowtie",      // straightens bow tie, pleased with himself
  "shrug",           // good-humoured "oh well"
  "celebrate",       // confetti popper / trophy / happy jig — a real win
  "take_note",       // pulls a notebook (or a giant pencil) out of his pocket and jots it down
  "announce",        // megaphone or ringing alarm clock out of his pocket — "attention please"
  "list_out",        // a to-do scroll that unrolls to the floor
  "hydrate",         // raises a glass of water — "drink some water"
  "workout",         // dumbbell curls / jumping jacks — coach mode
  "caring",          // leans in with concern, or hand on heart
  "charm",           // offers a single red rose
  "dance",           // silly happy jig or a ballroom twirl
  "investigate",     // peers through a magnifying glass
  "magic",           // endless string of hankies from his pocket
] as const;

export type ReactionName = (typeof REACTIONS)[number];

type Listener = (reaction: ReactionName) => void;
const listeners = new Set<Listener>();

let lastFiredAt = 0;

/** Fire a character expression on screen. Optional `force` bypasses conversational cooldown. */
export function triggerExpression(reaction: ReactionName, opts: { force?: boolean } = {}) {
  const now = Date.now();
  if (!opts.force && now - lastFiredAt < 2800) return;
  lastFiredAt = now;
  listeners.forEach((l) => l(reaction));
}

export function onExpression(l: Listener) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function isReactionName(v: unknown): v is ReactionName {
  return typeof v === "string" && (REACTIONS as readonly string[]).includes(v);
}

/**
 * Fallback cue matcher on live conversation transcripts (`userLine` / `agentLine`)
 * so Oliver & Aria react naturally even if the voice LLM doesn't explicitly call `express`.
 */
export function inferReactionFromText(role: "user" | "agent", text: string): ReactionName | null {
  const s = text.toLowerCase();

  if (role === "user") {
    if (/^\s*(hi|hey|hello|hiya|good (morning|afternoon|evening))\b/.test(s)) {
      return "wave";
    }
    if (/\b(romantic|flirt|date|kiss|crush|handsome|cute|hot|sexy|love you|marry|naughty|wink)\b/.test(s)) {
      return "flirty_wink";
    }
    if (/\b(thank you|thanks|you're the best|amazing|awesome|appreciate|good job|well done)\b/.test(s)) {
      return Math.random() < 0.5 ? "gentleman_bow" : "flattered";
    }
    if (/\b(tired|exhausted|stressed|overwhelmed|burnout|burned out|sad|anxious|struggling|hard day|bad day|lonely|upset)\b/.test(s)) {
      return "caring";
    }
    if (/\b(gym|workout|work out|exercise|lift|run|running|cardio)\b/.test(s)) {
      return "workout";
    }
    if (/\b(dance|party|celebrate|let's go|woohoo|yay)\b/.test(s)) {
      return "dance";
    }
    if (/\b(youtube|tiktok|reddit|netflix|scrolling|procrastinat|distracted|slacking)\b/.test(s)) {
      return "caught_you";
    }
    if (/\b(haha|hehe|lol|funny|joke|kidding|teasing)\b/.test(s)) {
      return "warm_laugh";
    }
    if (/\b(got the job|promotion|promoted|won|i passed|got in|offer letter|record)\b/.test(s)) {
      return "celebrate";
    }
    if (/\b(finished|done|nailed it|crushed it|completed|shipped)\b/.test(s)) {
      return "proud_cheer";
    }
  } else {
    if (/\b(i'll note|noted|making a note|jotting|i've added|added .* to your list|i'll remember)\b/.test(s)) {
      return "take_note";
    }
    if (/\b(your list|to-do|todo list|on your plate)\b/.test(s)) {
      return "list_out";
    }
    if (/\b(drink (some )?water|hydrat|glass of water)\b/.test(s)) {
      return "hydrate";
    }
    if (/\b(let's investigate|let me look|curious|mystery|let's see what)\b/.test(s)) {
      return "investigate";
    }
    if (/\b(i'm so sorry|that sounds (hard|tough|difficult)|i'm here for you|take a breath)\b/.test(s)) {
      return "caring";
    }
    if (/\b(wink|charm|flatter|stealing|careful now|my pleasure, darling|splendidly|oh my)\b/.test(s)) {
      return "cheeky_smirk";
    }
    if (/\b(congratulations|brilliant|well done|proud of you|bravo|nicely done)\b/.test(s)) {
      return "proud_cheer";
    }
    if (/\b(at your service|delighted|honour|honor|pleasure to serve)\b/.test(s)) {
      return "gentleman_bow";
    }
    if (/\b(ha!|haha|chuckle|amusing)\b/.test(s)) {
      return "warm_laugh";
    }
    if (/\b(ahem|distract|supposed to be working|back to work)\b/.test(s)) {
      return "caught_you";
    }
    if (/\b(goodbye|good night|farewell|see you|until next time|cheerio)\b/.test(s)) {
      return "wave";
    }
    if (/\b(after you|here you go|shall we|off you go|the floor is yours)\b/.test(s)) {
      return "after_you";
    }
    if (/\b(minutes left|time's nearly|almost time|right on time|punctual)\b/.test(s)) {
      return "check_watch";
    }
    if (/\b(i'm afraid|unfortunately|sadly not|i'd advise against)\b/.test(s)) {
      return "head_shake";
    }
    if (/\b(oh well|no matter|these things happen|can't win them all)\b/.test(s)) {
      return "shrug";
    }
    if (/\b(indeed|quite right|exactly|precisely|absolutely)\b/.test(s)) {
      return "nod";
    }
  }

  return null;
}

// Expose handy console helper for quick manual testing (`window.bubbaExpress("flirty_wink")`)
if (typeof window !== "undefined") {
  (window as unknown as { bubbaExpress?: (r: ReactionName) => void }).bubbaExpress = (r) =>
    triggerExpression(r, { force: true });
}
