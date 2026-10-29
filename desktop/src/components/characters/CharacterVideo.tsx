import { useEffect, useRef, useState, type ReactNode } from "react";
import { useChat } from "../../lib/conversation";
import { onExpression, type ReactionName } from "../../lib/expressions";
import { onQuirk, type QuirkName } from "../../lib/quirks";
import { useOutfit } from "../../lib/outfits";
import { useAttire } from "../../lib/characters";
import { getViseme } from "../../lib/visemes";
import { mediaReady, mediaUrl } from "../../lib/media";
import { restClips, routinePool } from "../../lib/routine";
import { useWalkState } from "../../lib/windowCtl";
import { useLive, type Mood } from "./rig";

export type VideoVariant = "oliver" | "aria";

type VideoManifest = {
  anchors?: { stand?: string; sit?: string };
  clips: string[];
  /** Extra looks, each with its own clip set in `videos/<char>/outfits/<name>/`.
   *  `change_in` (everyday → this outfit) and `change_out` (this outfit → everyday) are the costume-change clips. */
  outfits?: Record<string, { clips: string[]; anchors?: { stand?: string; sit?: string } }>;
  /** Looks the person can choose (e.g. Aria's flight-attendant uniform), in `videos/<char>/attires/<id>/`. */
  attires?: Record<string, { clips: string[]; anchors?: { stand?: string; sit?: string } }>;
  /** false = don't draw the live mouth overlay (her "closed-mouth" clips still move their own mouth). */
  lipsync?: boolean;
};

const manifestCache = new Map<VideoVariant, VideoManifest | null>();
const manifestPromises = new Map<VideoVariant, Promise<VideoManifest | null>>();

export function loadManifest(variant: VideoVariant): Promise<VideoManifest | null> {
  if (manifestCache.has(variant)) return Promise.resolve(manifestCache.get(variant)!);
  let p = manifestPromises.get(variant);
  if (!p) {
    p = mediaReady()
      .then(() => fetch(mediaUrl(`videos/${variant}/manifest.json`), { cache: "no-cache" }))
      .then((r) => (r.ok ? (r.json() as Promise<VideoManifest>) : null))
      .catch(() => null)
      .then((m) => {
        if (m && m.clips.length > 0) manifestCache.set(variant, m);
        else manifestPromises.delete(variant);
        return m;
      });
    manifestPromises.set(variant, p);
  }
  return p;
}

/* ------------------------------------------------------------------ *
 * Live lip-sync layer: mouth sprites drawn over "mute_*" talking clips
 * (body gestures with a closed mouth), following a per-frame face track.
 * Assets: /videos/<char>/lips/lips.json + <viseme>.png
 * ------------------------------------------------------------------ */
type LipsData = {
  frame: [number, number];          // coordinate space of box/tracks (source video size)
  fps: number;
  box: [number, number, number, number]; // sprite rect at rest: x, y, w, h
  visemes: string[];
  tracks: Record<string, [number, number, number][]>; // per frame: dx, dy, visible
};
type Lips = { data: LipsData; sprites: Record<string, HTMLImageElement> };
const lipsCache = new Map<VideoVariant, Promise<Lips | null>>();

function loadLips(variant: VideoVariant): Promise<Lips | null> {
  let p = lipsCache.get(variant);
  if (!p) {
    p = mediaReady()
      .then(() => fetch(mediaUrl(`videos/${variant}/lips/lips.json`), { cache: "no-cache" }))
      .then((r) => (r.ok ? (r.json() as Promise<LipsData>) : null))
      .then(async (data) => {
        if (!data) return null;
        const sprites: Record<string, HTMLImageElement> = {};
        await Promise.all(
          data.visemes.map(
            (v) =>
              new Promise<void>((res) => {
                const img = new Image();
                img.onload = () => res();
                img.onerror = () => res();
                img.src = mediaUrl(`videos/${variant}/lips/${v}.png`);
                sprites[v] = img;
              }),
          ),
        );
        return { data, sprites };
      })
      .catch(() => null);
    lipsCache.set(variant, p);
  }
  return p;
}

/* ------------------------------------------------------------------ *
 * Clip library. Every clip starts AND ends on the same anchor frame,
 * so any clip can follow any other with no visible jump. Names in each
 * list are tried in order; older synthesized names are kept as fallbacks.
 * ------------------------------------------------------------------ */

const LOOP = {
  idle: ["idle", "idle_2"],
  // "listening" and "nod_yes" were generated with a moving mouth, so they read as talking;
  // while the person speaks he holds a calm, closed-mouth idle instead.
  listen: ["listen_tilt", "idle_2", "listen_tilt", "idle"],
  think: ["thinking"],
  talk: ["talk_count", "talk_point", "talk_shape", "talk_casual", "talking"],
  /** Closed-mouth gesture clips with a face track: the lip-sync layer draws the mouth live. */
  talkSynced: ["mute_point", "mute_shape", "mute_heart", "mute_explain", "mute_excited", "mute_thoughtful", "mute_casual", "mute_casual2"],
  walk: ["walk"],
  sit: ["sitting_focus", "sitting_focus", "sit_read", "sit_tea"],
} as const;

const REACTION_CLIPS: Record<ReactionName, string[]> = {
  flirty_wink: ["wink", "flirty_wink"],
  cheeky_smirk: ["wink", "shrug", "cheeky_smirk"],
  warm_laugh: ["chuckle", "warm_laugh"],
  flattered: ["greet_bow", "flattered", "gentleman_bow"],
  gentleman_bow: ["greet_bow", "gentleman_bow"],
  proud_cheer: ["cheer", "proud_cheer"],
  sympathetic: ["greet_bow", "sympathetic"],
  surprised: ["surprised"],
  caught_you: ["shake_no", "caught_you"],
  sleepy_yawn: ["yawn", "sleepy_yawn"],
  nod: ["nod_yes"], // mouth moves in this take; only used when asked for explicitly
  head_shake: ["shake_no"],
  wave: ["wave", "greet_bow", "gentleman_bow"],
  after_you: ["after_you", "greet_bow"],
  check_watch: ["pocket_watch"],
  fix_bowtie: ["bowtie"],
  shrug: ["shrug", "caught_you"],
  // Each entry lists alternatives; one is picked at random from those that shipped.
  celebrate: ["pocket_confetti|prop_trophy|dance_jig", "cheer"],
  take_note: ["prop_notebook|pocket_pencil"],
  announce: ["pocket_megaphone|pocket_alarm", "pocket_watch"],
  list_out: ["pocket_scroll", "prop_notebook"],
  hydrate: ["prop_water"],
  workout: ["prop_dumbbells|life_jumping_jacks|life_pushups"],
  caring: ["care_lean|care_heart", "greet_bow"],
  charm: ["prop_rose", "wink"],
  dance: ["dance_jig|dance_twirl", "cheer"],
  investigate: ["prop_magnifier", "thinking"],
  magic: ["pocket_hankies", "wink"],
};

const QUIRK_TO_REACTION: Record<string, ReactionName> = {
  wave: "wave",
  greet: "gentleman_bow",
  shrug: "shrug",
  focus: "check_watch",
};

/** Little habits he does on his own while nobody is talking to him. Weights shift with mood. */
function idleHabits(mood: Mood): [string, number][] {
  if (mood === "sleepy") return [["yawn", 5], ["life_doze_stand", 4], ["pocket_watch", 1], ["prop_tea", 1]];
  if (mood === "focus") return [["pocket_watch", 3], ["bowtie", 1], ["prop_notebook", 1], ["prop_book", 1]];
  // otherwise: whatever his daily routine says he'd be doing at this hour (see lib/routine.ts),
  // with the old classics mixed in
  return [...routinePool(), ["bowtie", 1], ["pocket_watch", 1], ["wink", 0.4], ["chuckle", 0.4]];
}

/** "a|b|c" → one of a, b, c at random (reaction alternatives). */
const oneOf = (s: string) => {
  const opts = s.split("|");
  return opts[Math.floor(Math.random() * opts.length)];
};

/** Clips that are fine to cut short (with a soft crossfade) when the situation changes. */
const INTERRUPTIBLE = new Set<string>(["listen_ear", "sit_sleep", ...LOOP.idle, ...LOOP.listen, ...LOOP.think, ...LOOP.talk, ...LOOP.talkSynced, ...LOOP.walk, ...LOOP.sit]);

type Mode = "idle" | "listen" | "think" | "talk" | "walk" | "sit";

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Path 1 character: a "director" that plays whole, anchor-locked motion clips back to back.
 *
 * It decides what Oliver/Aria does next, every time a clip finishes:
 *  - talking   → a different talking-gesture clip each time (counting, pointing, hand on heart, ...)
 *  - listening → attentive listening, with the occasional nod
 *  - thinking  → thinking pose
 *  - idle      → breathing idles, plus a little habit every 20–50 s (bow tie, pocket watch, wink...)
 *  - walking   → walk cycle while the window strolls
 *  - focus     → sits down in the corner, stands back up when called
 * Reactions (from the voice agent's `express` tool, transcript cues, mood changes or quirks)
 * are queued and play at the next clip boundary, so nothing ever pops.
 *
 * Two <video> slots are double-buffered: the next clip loads in the hidden slot and is only
 * revealed once it is actually playing, while the old slot holds its final (anchor) frame.
 */
export default function CharacterVideo({
  variant,
  mood,
  size,
  framing = "body",
  walking: walkingProp,
  facing,
  fallback,
}: {
  variant: VideoVariant;
  mood: Mood;
  size: number;
  framing?: "full" | "body" | "bust";
  walking?: boolean;
  facing?: number;
  fallback: ReactNode;
}) {
  const isBust = framing === "bust";
  const [manifest, setManifest] = useState<VideoManifest | null | undefined>(() =>
    manifestCache.has(variant) ? manifestCache.get(variant)! : undefined,
  );
  const live = useLive(mood);
  const chat = useChat();
  const walkWin = useWalkState();
  const wantedOutfit = useOutfit();
  const chosenAttire = useAttire(variant);
  const isWalking = walkingProp ?? walkWin.walking;
  const flipLeft = facing !== undefined ? facing < -0.2 : isWalking && walkWin.dir === -1;

  useEffect(() => {
    let alive = true;
    loadManifest(variant).then((m) => { if (alive) setManifest(m); });
    return () => { alive = false; };
  }, [variant]);

  // "Speaking" from the voice meter flickers between words; hold it for a beat so he doesn't
  // drop his talking gestures in every tiny pause.
  const [talkHeld, setTalkHeld] = useState(false);
  useEffect(() => {
    if (live.talking || chat.status === "speaking") { setTalkHeld(true); return; }
    const t = window.setTimeout(() => setTalkHeld(false), 350);
    return () => window.clearTimeout(t);
  }, [live.talking, chat.status]);

  const wantsSit = !isBust && (mood === "focus" || mood === "sleepy") && !talkHeld && !live.listening && !isWalking;
  const mode: Mode =
    isWalking ? "walk" :
    wantsSit ? "sit" :
    talkHeld ? "talk" :
    live.listening ? "listen" :
    live.thinking ? "think" :
    "idle";

  /* ---------------- director state (refs: no re-render per decision) ---------------- */
  const slots = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)];
  const activeSlot = useRef(0);
  const slotGen = useRef([0, 0]);
  const fadeMs = useRef(0);
  const current = useRef<string | null>(null);
  const loading = useRef<string | null>(null);
  const activeOutfit = useRef<string>("default");   // the outfit he is wearing right now
  const currentOutfit = useRef<string>("default");  // the outfit of the clip on screen
  const loadingOutfit = useRef<string>("default");
  const loadingUrl = useRef<string>("");
  const currentUrl = useRef<string>("");
  const wantOutfit = useRef<string>(wantedOutfit);
  wantOutfit.current = wantedOutfit;
  const nextFade = useRef(0);
  const attire = useRef<string>("default");       // attire currently worn (base clip set)
  const wantAttire = useRef(chosenAttire);
  wantAttire.current = chosenAttire;
  const broken = useRef(new Set<string>());
  const posture = useRef<"standing" | "sitting">("standing");
  const queue = useRef<string[]>([]);
  const lastPlayed = useRef<string[]>([]);
  const nextHabitAt = useRef(performance.now() + rand(12000, 22000));
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const inChat = useRef(false);
  inChat.current = chat.status !== "off";
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;
  const [started, setStarted] = useState(false);
  const lipsRef = useRef<Lips | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    loadLips(variant).then((l) => { if (alive) lipsRef.current = l; });
    return () => { alive = false; };
  }, [variant]);

  // Draw the live mouth over lip-synced clips, every display frame.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = canvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const box = cv.parentElement;
      const bw = box?.clientWidth ?? 0;
      const bh = box?.clientHeight ?? 0;
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(bw * dpr) || cv.height !== Math.round(bh * dpr)) {
        cv.width = Math.round(bw * dpr);
        cv.height = Math.round(bh * dpr);
      }
      ctx.clearRect(0, 0, cv.width, cv.height);
      const lips = lipsRef.current;
      const name = current.current;
      const v = slots[activeSlot.current].current;
      if (!lips || !name || !v || loading.current || currentOutfit.current !== "default" || manifestRef.current?.lipsync === false) return;
      // attire clips have their own face tracks, keyed "<attire>/<clip>" (same face, so same mouth sprites)
      const track = lips.data.tracks[trackKey(name)];
      if (!track || !v.videoWidth) return;
      const [fw, fh] = lips.data.frame;
      const fi = Math.min(track.length - 1, Math.max(0, Math.round(v.currentTime * lips.data.fps)));
      const [dx, dy, vis] = track[fi];
      if (!vis) return;
      const sprite = lips.sprites[getViseme()];
      if (!sprite?.complete || !sprite.naturalWidth) return;
      // where the (object-contain) video actually sits inside its box
      const scale = Math.min(bw / v.videoWidth, bh / v.videoHeight);
      const rw = v.videoWidth * scale;
      const rh = v.videoHeight * scale;
      const ox = (bw - rw) / 2;
      const oy = (bh - rh) / 2;
      const [x, y, w, h] = lips.data.box;
      ctx.drawImage(
        sprite,
        (ox + ((x + dx) / fw) * rw) * dpr,
        (oy + ((y + dy) / fh) * rh) * dpr,
        (w / fw) * rw * dpr,
        (h / fh) * rh * dpr,
      );
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trackKey = (clip: string) => (attire.current === "default" ? clip : `${attire.current}/${clip}`);
  const attireClips = (a: string) =>
    (a === "default" ? manifestRef.current?.clips : manifestRef.current?.attires?.[a]?.clips) ?? [];
  const clipsFor = (o: string) =>
    (o === "default" ? attireClips(attire.current) : manifestRef.current?.outfits?.[o]?.clips) ?? [];
  const url = (name: string, o: string = activeOutfit.current) =>
    o !== "default" ? mediaUrl(`videos/${variant}/outfits/${o}/${name}.webm`)
    : attire.current === "default" ? mediaUrl(`videos/${variant}/${name}.webm`)
    : mediaUrl(`videos/${variant}/attires/${attire.current}/${name}.webm`);
  const has = (name: string, o: string = activeOutfit.current) =>
    clipsFor(o).includes(name) && !broken.current.has(url(name, o));
  const outfitReady = (o: string) => o === "default" || clipsFor(o).some((c) => has(c, o));
  const first = (names: readonly string[]) => names.find((n) => has(n)) ?? null;

  /** Pick from a pool, avoiding whatever played most recently. */
  const pickFresh = (names: readonly string[]) => {
    const avail = names.filter((n) => has(n));
    if (avail.length === 0) return null;
    const fresh = avail.filter((n) => !lastPlayed.current.slice(-2).includes(n));
    const pool = fresh.length ? fresh : avail;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const pickWeighted = (pairs: [string, number][]) => {
    const avail = pairs.filter(([n]) => has(n) && n !== lastPlayed.current[lastPlayed.current.length - 1]);
    const total = avail.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [n, w] of avail) if ((r -= w) <= 0) return n;
    return null;
  };

  /** Decide the next clip from the current situation. */
  const decide = (): string | null => {
    const m = modeRef.current;
    // At night, with nobody talking to him, he sleeps on his ledge (until the wake word or a click).
    const rest = m === "idle" && !inChat.current && !queue.current.length ? restClips() : null;
    const resting = !!rest && rest.some((c) => has(c)) && (has("sit_down") || posture.current === "sitting");

    // Posture first: stand up before doing anything that isn't sitting, sit down for focus.
    if (posture.current === "sitting" && m !== "sit" && !resting) {
      if (has("stand_up")) return "stand_up";
      posture.current = "standing";
    }
    // Chosen attire changed (from the picker): soft crossfade into the new look while standing.
    const wa = attireClips(wantAttire.current).length ? wantAttire.current : "default";
    if (wa !== attire.current && activeOutfit.current === "default" && posture.current === "standing" && m !== "walk") {
      attire.current = wa;
      nextFade.current = 400;
    }

    // Costume change: only from a standing pose, never mid-walk. Mood outfits are made to
    // change from (and back into) the default attire only.
    const want = attire.current === "default" ? wantOutfit.current : "default";
    if (want !== activeOutfit.current && m !== "walk" && posture.current === "standing" && outfitReady(want)) {
      if (activeOutfit.current !== "default") {
        if (has("change_out")) return "change_out"; // ends in everyday clothes (see advance)
        activeOutfit.current = "default";
        nextFade.current = 350;
      }
      if (want !== "default") {
        activeOutfit.current = want;
        if (has("change_in")) return "change_in";
        nextFade.current = 350;
      }
    }

    if (m === "sit" || resting) {
      if (posture.current === "standing") {
        if (has("sit_down")) return "sit_down";
        posture.current = "sitting";
      }
      if (resting) return first(rest!); // sit_sleep (falls back to sitting_focus until it ships)
      return pickFresh(LOOP.sit) ?? first(LOOP.idle);
    }
    if (m === "walk") return first(LOOP.walk) ?? first(LOOP.idle);

    // Queued reactions play at the first clean boundary, but never over his own speech.
    while (m !== "talk" && queue.current.length) {
      const q = queue.current.shift()!;
      if (has(q)) return q;
    }

    if (m === "talk") {
      if (manifestRef.current?.lipsync === false) // no overlay: play gesture clips with their own mouth movement
        return pickFresh(LOOP.talk) ?? pickFresh(LOOP.talkSynced) ?? first(LOOP.idle);
      const synced = lipsRef.current ? pickFresh(LOOP.talkSynced.filter((c) => !!lipsRef.current?.data.tracks[trackKey(c)])) : null;
      return synced ?? pickFresh(LOOP.talk) ?? first(LOOP.idle);
    }
    if (m === "listen") {
      // now and then a playful "I'm all ears" (hand cupped behind the ear)
      if (Math.random() < 0.15 && has("listen_ear") && !lastPlayed.current.includes("listen_ear")) return "listen_ear";
      return pickFresh(LOOP.listen) ?? first(LOOP.idle);
    }
    if (m === "think") return first(LOOP.think) ?? first(LOOP.idle);

    // Idle: breathe, and every so often do a little habit (not while a conversation is open).
    const now = performance.now();
    if (!inChat.current && now >= nextHabitAt.current) {
      // he keeps himself busy: something every 8–20 s, with a breath of plain idle in between
      nextHabitAt.current = now + rand(8000, 20000);
      const habit = pickWeighted(idleHabits(moodRef.current));
      if (habit) return habit;
    }
    return pickFresh(LOOP.idle);
  };

  /** Load `name` into the hidden slot; reveal it once it's really playing. */
  const play = (name: string, crossfadeMs = 0) => {
    const next = 1 - activeSlot.current;
    const v = slots[next].current;
    if (!v) return;
    loading.current = name;
    loadingOutfit.current = activeOutfit.current;
    slotGen.current[next]++;
    fadeMs.current = crossfadeMs;
    v.style.transition = "none";
    v.style.opacity = "0";
    v.style.zIndex = "1";
    loadingUrl.current = url(name, loadingOutfit.current);
    v.src = loadingUrl.current;
    v.currentTime = 0;
    void v.play().catch(() => {});
  };

  const onSlotPlaying = (slot: number) => {
    const v = slots[slot].current;
    const name = loading.current;
    if (!v || !name || slot === activeSlot.current) return;
    const oldSlot = activeSlot.current;
    const old = slots[oldSlot].current;
    v.style.transition = fadeMs.current ? `opacity ${fadeMs.current}ms linear` : "none";
    v.style.zIndex = "2";
    v.style.opacity = "1";
    if (old) {
      old.style.zIndex = "1";
      // keep the old frame under the new one until the fade (if any) is done
      const gen = slotGen.current[oldSlot];
      window.setTimeout(() => {
        if (slotGen.current[oldSlot] !== gen || activeSlot.current === oldSlot) return;
        old.style.opacity = "0";
        old.pause();
      }, 60 + fadeMs.current);
    }
    activeSlot.current = slot;
    current.current = name;
    currentOutfit.current = loadingOutfit.current;
    currentUrl.current = loadingUrl.current;
    loading.current = null;
    lastPlayed.current = [...lastPlayed.current.slice(-4), name];
    if (name === "sit_down") posture.current = "sitting";
    setStarted(true);
  };

  const advance = () => {
    const done = current.current;
    if (done === "stand_up") posture.current = "standing";
    if (done === "sit_down") posture.current = "sitting";
    if (done === "change_out") activeOutfit.current = "default";
    const next = decide();
    if (!next) return;
    const fade = nextFade.current;
    nextFade.current = 0;
    if (url(next) === currentUrl.current && !fade) {
      // same clip again: just rewind in place (it ends on its own first frame)
      const v = slots[activeSlot.current].current;
      if (v) { v.currentTime = 0; void v.play().catch(() => {}); }
      lastPlayed.current = [...lastPlayed.current.slice(-4), next];
      return;
    }
    play(next, fade);
  };

  const onSlotEnded = (slot: number) => {
    if (slot !== activeSlot.current || loading.current) return;
    advance();
  };

  const onSlotError = (slot: number) => {
    if (slot === activeSlot.current) return;
    const bad = loading.current;
    loading.current = null;
    if (bad) broken.current.add(loadingUrl.current);
    // carry on from the current clip's end
    if (!current.current) advance();
  };

  // Kick off once the manifest arrives.
  useEffect(() => {
    if (!manifest || current.current || loading.current) return;
    const greet = moodRef.current === "happy" && has("wave") ? "wave" : null;
    play(greet ?? decide() ?? "idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest]);

  // Situation changed: cut a loop short with a soft crossfade; one-shots finish first.
  useEffect(() => {
    const cur = current.current;
    if (!manifest || !cur || loading.current) return;
    const urgent = mode === "walk" && !LOOP.walk.includes(cur as never);
    if (!INTERRUPTIBLE.has(cur) && !urgent) return;
    const next = decide();
    nextFade.current = 0;
    if (next && url(next) !== currentUrl.current) play(next, 160);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, wantedOutfit, chosenAttire]);

  // Reactions from anywhere in the app.
  const enqueue = (clips: string[]) => {
    // each entry may hold alternatives ("a|b|c"): pick at random among the ones that shipped
    let pick: string | null = null;
    for (const c of clips) {
      const ok = c.split("|").filter((n) => has(n));
      if (ok.length) { pick = oneOf(ok.join("|")); break; }
    }
    if (!pick || isWalking) return;
    queue.current = [pick]; // the newest reaction wins; don't build up a backlog
    const cur = current.current;
    // Interrupt calm loops right away so the reaction feels responsive (not mid-sentence talking).
    if (cur && !loading.current && (LOOP.idle as readonly string[]).concat(LOOP.listen, LOOP.think).includes(cur)) {
      const next = decide();
      nextFade.current = 0;
      if (next) play(next, 140);
    }
  };
  const enqueueRef = useRef(enqueue);
  enqueueRef.current = enqueue;

  useEffect(() => onExpression((r) => enqueueRef.current(REACTION_CLIPS[r] ?? [r])), []);
  useEffect(
    () =>
      onQuirk((q: QuirkName) => {
        const mapped = QUIRK_TO_REACTION[q];
        if (mapped) enqueueRef.current(REACTION_CLIPS[mapped]);
        else if (q === "fidget") enqueueRef.current(Math.random() < 0.5 ? ["bowtie"] : ["pocket_watch"]);
        else if (q.startsWith("quirk_")) enqueueRef.current([q.slice(6)]);
      }),
    [],
  );

  // Automatic reactions to what's happening in the app.
  const prevMood = useRef(mood);
  useEffect(() => {
    const from = prevMood.current;
    prevMood.current = mood;
    if (from === mood) return;
    if (mood === "cheer") enqueueRef.current(REACTION_CLIPS.proud_cheer);
    else if (mood === "oops") enqueueRef.current(REACTION_CLIPS.shrug);
    else if (mood === "happy" && from === "sleepy") enqueueRef.current(REACTION_CLIPS.gentleman_bow);
  }, [mood]);

  // A voice call just opened: greet the person.
  const prevChat = useRef(chat.status);
  useEffect(() => {
    const from = prevChat.current;
    prevChat.current = chat.status;
    if (from === "connecting" && chat.status === "listening") {
      enqueueRef.current(Math.random() < 0.5 ? REACTION_CLIPS.wave : REACTION_CLIPS.gentleman_bow);
    }
  }, [chat.status]);

  if (manifest === undefined || manifest === null || (manifest.clips.length === 0 && !manifest.anchors?.stand)) {
    return <>{fallback}</>;
  }

  const w = size;
  const h = isBust ? Math.round(size * 1.05) : Math.round(size * 1.32);
  const stageStyle = isBust
    ? {
        position: "absolute" as const,
        left: "50%",
        top: 0,
        width: Math.round(size * 1.48),
        height: Math.round(size * 1.48 * (704 / 396)),
        transform: "translateX(-50%)",
      }
    : undefined;
  const attireAnchor = chosenAttire !== "default" ? manifest.attires?.[chosenAttire]?.anchors?.stand : undefined;
  const posterUrl = attireAnchor
    ? mediaUrl(`videos/${variant}/attires/${chosenAttire}/${attireAnchor}`)
    : manifest.anchors?.stand ? mediaUrl(`videos/${variant}/${manifest.anchors.stand}`) : undefined;
  const videoClass = "absolute inset-0 h-full w-full object-contain drop-shadow-[0_6px_14px_rgba(20,16,35,0.22)]";

  return (
    <div
      style={{
        width: w,
        height: h,
        transform: flipLeft ? "scaleX(-1)" : undefined,
        transition: "transform 180ms ease-out",
      }}
      className={`relative select-none pointer-events-none ${isBust ? "overflow-hidden rounded-xl" : ""}`}
      aria-label={`${variant === "oliver" ? "Oliver" : "Aria"} companion`}
    >
      <div style={stageStyle} className={isBust ? undefined : "absolute inset-0"}>
        {posterUrl && !started && <img src={posterUrl} alt="" draggable={false} className={videoClass} />}
        {[0, 1].map((i) => (
          <video
            key={i}
            ref={slots[i]}
            muted
            playsInline
            preload="auto"
            onPlaying={() => onSlotPlaying(i)}
            onEnded={() => onSlotEnded(i)}
            onError={() => onSlotError(i)}
            style={{ opacity: 0, zIndex: 1 }}
            className={videoClass}
          />
        ))}
        <canvas ref={canvasRef} style={{ zIndex: 3 }} className="pointer-events-none absolute inset-0 h-full w-full" />
      </div>
    </div>
  );
}
