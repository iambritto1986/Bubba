/**
 * Path 1 Anchor-Locked Character Video Generator for Bubba (`oliver` & `aria`).
 *
 * Usage:
 *   node character-video/generate_videos.mjs idle talking flirty_wink
 *   node character-video/generate_videos.mjs --character=aria --core
 *   node character-video/generate_videos.mjs --character=oliver --all
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load server/.env manually so no extra dependency is needed at root
const envPath = path.join(ROOT, "server", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

const { GoogleGenAI } = await import(
  path.join(ROOT, "server", "node_modules", "@google", "genai", "dist", "node", "index.mjs")
    .replace(/\\/g, "/")
    .replace(/^([A-Za-z]):/, "file:///$1:")
);

const MODEL = "gemini-omni-1.1-flash";

const OLIVER_LOCK =
  "Static locked tripod camera, zero camera movement, zero zoom, plain flat studio grey background, full body in frame, Disney Pixar 3D animated film style, keeping exact facial identity, hair, navy gold-trimmed tailcoat, burgundy bow tie, and white butler gloves.";

const ARIA_LOCK =
  "Static locked tripod camera, zero camera movement, zero zoom, plain flat studio grey background, full body in frame, Disney Pixar 3D animated film style, keeping exact facial identity, soft chestnut-auburn wavy hair, emerald-green eyes, flowing rose-blush evening dress with champagne-gold trim, and sleek champagne-rose heels.";

/** @type {Record<string, { start: 'stand' | 'sit'; end: 'stand' | 'sit'; core?: boolean; prompt: string }>} */
export const OLIVER_CLIPS = {
  idle: {
    start: "stand",
    end: "stand",
    core: true,
    prompt: `${OLIVER_LOCK} Oliver stands poised and relaxed, gentle natural chest breathing, two soft natural blinks, subtle warm gentleman smile, slight natural weight shift, returning smoothly to his exact starting clasped-hands stance.`,
  },
  talking: {
    start: "stand",
    end: "stand",
    core: true,
    prompt: `${OLIVER_LOCK} Oliver speaks warmly and articulately to the viewer with natural expressive conversational mouth movements, natural blinks, and a poised open-palm white-gloved butler gesture at chest height before returning smoothly to his clasped-hands stance.`,
  },
  listening: {
    start: "stand",
    end: "stand",
    core: true,
    prompt: `${OLIVER_LOCK} Oliver listens attentively with closed lips and a warm encouraging smile, leaning slightly forward with an engaged head tilt and two gentle understanding nods, then settling smoothly back to his starting stance.`,
  },
  thinking: {
    start: "stand",
    end: "stand",
    core: true,
    prompt: `${OLIVER_LOCK} Oliver brings one white-gloved hand thoughtfully to his chin, raises one eyebrow curiously while glancing slightly upward in contemplation with a faint clever smirk, then lowers his hand back to his clasped stance.`,
  },
  flirty_wink: {
    start: "stand",
    end: "stand",
    core: true,
    prompt: `${OLIVER_LOCK} Oliver gives a charming, playful double-eyebrow bounce followed by a smooth confident wink with his right eye and a cheeky charismatic half-smirk, tilting his head slightly before settling back into his warm poised smile.`,
  },
  cheeky_smirk: {
    start: "stand",
    end: "stand",
    prompt: `${OLIVER_LOCK} Oliver tilts his head with an amused raised single eyebrow and a witty, knowing gentleman smirk, briefly adjusting his burgundy bow tie with one white-gloved hand before returning to his poised stance.`,
  },
  warm_laugh: {
    start: "stand",
    end: "stand",
    prompt: `${OLIVER_LOCK} Oliver lets out a warm, genuine, charming chuckle—shoulders softly laughing, eyes crinkling warmly with a bright smile, briefly placing one white-gloved hand lightly over his chest—before composing himself back into his stance.`,
  },
  gentleman_bow: {
    start: "stand",
    end: "stand",
    core: true,
    prompt: `${OLIVER_LOCK} Oliver places his right white-gloved hand gracefully over his heart and performs a refined, courteous royal butler bow from the waist while keeping warm eye contact, then rises smoothly back to his starting stance.`,
  },
  proud_cheer: {
    start: "stand",
    end: "stand",
    core: true,
    prompt: `${OLIVER_LOCK} Oliver beams with a proud, celebratory grin and gives three crisp, enthusiastic white-gloved applause claps at chest height to congratulate the viewer, then settles warmly back to his clasped-hands stance.`,
  },
  caught_you: {
    start: "stand",
    end: "stand",
    prompt: `${OLIVER_LOCK} Oliver crosses his arms playfully, raises one eyebrow high in a witty 'caught you slacking' expression with a light theatrical shake of his head and an amused sigh, then uncrosses his arms back to his stance.`,
  },
  flattered: {
    start: "stand",
    end: "stand",
    prompt: `${OLIVER_LOCK} Oliver looks pleasantly charmed and slightly bashful—glancing briefly aside with a warm flattered smile and touching the back of his neck lightly with one gloved hand—before looking back warmly in his poised stance.`,
  },
  sympathetic: {
    start: "stand",
    end: "stand",
    prompt: `${OLIVER_LOCK} Oliver softens his brows empathetically, tilts his head warmly, and gives two slow reassuring nods with a gentle supportive smile before settling back to his stance.`,
  },
  surprised: {
    start: "stand",
    end: "stand",
    prompt: `${OLIVER_LOCK} Oliver's eyebrows shoot up in pleasant surprise with wide expressive eyes and a slight lean back, mouth forming a brief 'oh!' before breaking into a warm grin and settling back to his stance.`,
  },
  sleepy_yawn: {
    start: "stand",
    end: "stand",
    prompt: `${OLIVER_LOCK} Oliver politely stifles a gentle late-night yawn behind one white-gloved hand with sleepy heavy-lidded eyes before blinking warmly and returning to his poised stance.`,
  },
  walk: {
    start: "stand",
    end: "stand",
    prompt: `${OLIVER_LOCK} Oliver performs a smooth, jaunty in-place gentleman stroll step cycle with natural arm swing and light head bob, beginning and ending smoothly in his poised standing pose.`,
  },
  sit_down: {
    start: "stand",
    end: "sit",
    core: true,
    prompt: `${OLIVER_LOCK} Oliver smoothly sits down into a relaxed seated posture, drawing a small brass pocket watch from his waistcoat into his white-gloved hand and smiling warmly at the viewer.`,
  },
  sitting_focus: {
    start: "sit",
    end: "sit",
    core: true,
    prompt: `${OLIVER_LOCK} Oliver sits comfortably and quietly keeping the viewer company, glancing down briefly at the open brass pocket watch in his white-gloved hand, blinking naturally, then looking back up with a calm supportive smile.`,
  },
  stand_up: {
    start: "sit",
    end: "stand",
    core: true,
    prompt: `${OLIVER_LOCK} Oliver perks up attentively, closes and pockets his brass pocket watch into his waistcoat, and rises smoothly to his feet into his poised clasped-hands butler stance with a warm ready smile.`,
  },
};

/** @type {Record<string, { start: 'stand' | 'sit'; end: 'stand' | 'sit'; core?: boolean; prompt: string }>} */
export const ARIA_CLIPS = {
  idle: {
    start: "stand",
    end: "stand",
    core: true,
    prompt: `${ARIA_LOCK} Aria stands with warm regal poise, gentle natural breathing, soft natural blinks of her emerald eyes, subtle warm smile, returning smoothly to her clasped-hands stance.`,
  },
  talking: {
    start: "stand",
    end: "stand",
    core: true,
    prompt: `${ARIA_LOCK} Aria speaks warmly and expressively to the viewer with natural conversational mouth articulation, graceful hand gesture at chest height, and expressive emerald eyes before returning smoothly to her clasped-hands stance.`,
  },
  listening: {
    start: "stand",
    end: "stand",
    core: true,
    prompt: `${ARIA_LOCK} Aria listens attentively with closed lips and a warm encouraging smile, tilting her head gracefully with two gentle understanding nods before settling back to her poised stance.`,
  },
  thinking: {
    start: "stand",
    end: "stand",
    core: true,
    prompt: `${ARIA_LOCK} Aria rests one finger thoughtfully against her chin, arches one eyebrow curiously while glancing upward in contemplation, then lowers her hand smoothly back to her clasped stance.`,
  },
  flirty_wink: {
    start: "stand",
    end: "stand",
    core: true,
    prompt: `${ARIA_LOCK} Aria gives a playful charming double-eyebrow lift followed by a sparkling confident wink and a cheeky storybook-queen half-smile with a graceful head tilt before returning to her poised smile.`,
  },
  cheeky_smirk: {
    start: "stand",
    end: "stand",
    prompt: `${ARIA_LOCK} Aria tilts her head with a witty raised single eyebrow and an amused knowing smile, lightly tucking a lock of auburn hair behind her ear before returning to her poised stance.`,
  },
  warm_laugh: {
    start: "stand",
    end: "stand",
    prompt: `${ARIA_LOCK} Aria shares a warm, genuine, musical laugh—shoulders lifting softly, emerald eyes crinkling with joy, one hand lightly touching her collarbone—before composing herself back into her stance.`,
  },
  gentleman_bow: {
    start: "stand",
    end: "stand",
    core: true,
    prompt: `${ARIA_LOCK} Aria places one hand gracefully over her heart and performs a warm, poised royal curtsy-nod while keeping kind eye contact, rising smoothly back to her starting stance.`,
  },
  proud_cheer: {
    start: "stand",
    end: "stand",
    core: true,
    prompt: `${ARIA_LOCK} Aria beams with a radiant celebratory smile and claps her hands joyfully at chest height to congratulate the viewer before settling back into her poised clasped-hands stance.`,
  },
  caught_you: {
    start: "stand",
    end: "stand",
    prompt: `${ARIA_LOCK} Aria places her hands playfully on her hips, arches one eyebrow high in a witty 'aren't you supposed to be focusing?' look with a light playful head shake, then returns to her clasped stance.`,
  },
  flattered: {
    start: "stand",
    end: "stand",
    prompt: `${ARIA_LOCK} Aria looks warmly charmed—glancing shyly down and aside with rosy cheeks and a soft delighted smile—before looking back up warmly in her poised stance.`,
  },
  sympathetic: {
    start: "stand",
    end: "stand",
    prompt: `${ARIA_LOCK} Aria softens her expression with caring empathy, tilts her head gently, and gives two warm reassuring nods before settling back to her poised stance.`,
  },
  surprised: {
    start: "stand",
    end: "stand",
    prompt: `${ARIA_LOCK} Aria's eyebrows lift in bright surprise with wide emerald eyes and a soft 'oh!' expression before breaking into an amused warm smile and returning to her stance.`,
  },
  sleepy_yawn: {
    start: "stand",
    end: "stand",
    prompt: `${ARIA_LOCK} Aria gracefully covers a soft late-night yawn with one hand and sleepy heavy-lidded eyes before blinking gently and returning to her poised stance.`,
  },
  walk: {
    start: "stand",
    end: "stand",
    prompt: `${ARIA_LOCK} Aria performs a graceful, lively in-place walking step cycle with gentle skirt sway and poised carriage, beginning and ending smoothly in her standing pose.`,
  },
  sit_down: {
    start: "stand",
    end: "sit",
    core: true,
    prompt: `${ARIA_LOCK} Aria smoothly settles into a graceful seated posture, opening a small gold-trimmed leather notebook with a gold fountain pen in hand and smiling warmly at the viewer.`,
  },
  sitting_focus: {
    start: "sit",
    end: "sit",
    core: true,
    prompt: `${ARIA_LOCK} Aria sits quietly keeping the viewer company, jotting a thoughtful note in her gold-trimmed leather notebook with her fountain pen, blinking naturally, and glancing up with a calm supportive smile.`,
  },
  stand_up: {
    start: "sit",
    end: "stand",
    core: true,
    prompt: `${ARIA_LOCK} Aria perks up warmly, closes her gold-trimmed leather notebook, and rises gracefully to her feet into her poised clasped-hands stance with a welcoming smile.`,
  },
};

export const CHARACTER_CLIP_SETS = {
  oliver: OLIVER_CLIPS,
  aria: ARIA_CLIPS,
};

const ANCHOR_DIR = path.join(ROOT, "character-video", "anchors");

function pathsFor(character) {
  return {
    standAnchor: path.join(ANCHOR_DIR, `${character}_anchor_a_stand.png`),
    sitAnchor: path.join(ANCHOR_DIR, `${character}_anchor_b_sit.png`),
    rawDir: path.join(ROOT, "character-video", "raw", character),
    outDir: path.join(ROOT, "desktop", "public", "videos", character),
  };
}

function readImageInput(character, anchorKey) {
  const p = pathsFor(character);
  const file = anchorKey === "sit" ? p.sitAnchor : p.standAnchor;
  return {
    imageBytes: fs.readFileSync(file).toString("base64"),
    mimeType: "image/png",
  };
}

export function writeManifest(character = "oliver") {
  const { outDir } = pathsFor(character);
  fs.mkdirSync(outDir, { recursive: true });
  const clips = fs
    .readdirSync(outDir)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => f.replace(/\.webm$/, ""))
    .sort();
  const manifest = {
    anchors: {
      stand: fs.existsSync(path.join(outDir, "anchor_stand.png")) ? "anchor_stand.png" : undefined,
      sit: fs.existsSync(path.join(outDir, "anchor_sit.png")) ? "anchor_sit.png" : undefined,
    },
    clips,
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

function runCutout(inputPath, outputPath) {
  const res = spawnSync(
    "uv",
    [
      "run",
      "--with", "rembg[cpu]",
      "--with", "imageio-ffmpeg",
      "--with", "pillow",
      "--with", "numpy",
      "python",
      path.join(ROOT, "character-video", "cutout_video.py"),
      "--input", inputPath,
      "--output", outputPath,
    ],
    { cwd: ROOT, stdio: "inherit" }
  );
  if (res.status !== 0) {
    throw new Error(`cutout_video.py failed with exit code ${res.status}`);
  }
}

async function generateClip(ai, character, name, spec, force = false) {
  const { rawDir, outDir } = pathsFor(character);
  const rawMp4 = path.join(rawDir, `${name}.mp4`);
  const outWebm = path.join(outDir, `${name}.webm`);

  if (!force && fs.existsSync(outWebm)) {
    console.log(`[skip] ${character}/${name}.webm already exists`);
    return true;
  }

  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  if (force || !fs.existsSync(rawMp4)) {
    console.log(`\n[omni-video] Generating '${character}/${name}' (${spec.start} -> ${spec.end}) via ${MODEL}...`);
    const startImg = readImageInput(character, spec.start);
    const input = [{ type: "image", data: startImg.imageBytes, mime_type: startImg.mimeType }];
    let fullPrompt = `Generate a smooth 4-second 9:16 vertical video starting and ending in this exact pose. ${spec.prompt}`;

    if (spec.start !== spec.end) {
      const endImg = readImageInput(character, spec.end);
      input.push({ type: "image", data: endImg.imageBytes, mime_type: endImg.mimeType });
      fullPrompt = `Generate a smooth 4-second 9:16 vertical video starting from the first image and ending in the exact pose of the second image. ${spec.prompt}`;
    }
    input.push({ type: "text", text: fullPrompt });

    let interaction = await ai.interactions.create({
      model: MODEL,
      input,
      generation_config: {
        video_config: { task: "image_to_video" },
      },
    });

    while (interaction.status === "in_progress" || interaction.status === "queued") {
      await new Promise((r) => setTimeout(r, 5000));
      interaction = await ai.interactions.get(interaction.id);
      process.stdout.write(".");
    }
    if (interaction.status !== "completed" && !interaction.output_video) {
      throw new Error(`Interaction ended with status '${interaction.status}': ${interaction.output_text || ""}`);
    }

    const vid = interaction.output_video;
    if (!vid) {
      throw new Error(`No output_video returned for '${name}'. Model text: ${interaction.output_text || "(none)"}`);
    }

    if (vid.data) {
      fs.writeFileSync(rawMp4, Buffer.from(vid.data, "base64"));
    } else if (vid.uri) {
      const res = await fetch(vid.uri, {
        headers: { "x-goog-api-key": process.env.GEMINI_API_KEY },
      });
      if (!res.ok) throw new Error(`Failed downloading video URI (${res.status})`);
      fs.writeFileSync(rawMp4, Buffer.from(await res.arrayBuffer()));
    } else {
      throw new Error(`output_video had neither data nor uri: ${JSON.stringify(vid)}`);
    }
    console.log(`[omni-video] Saved raw MP4 -> ${rawMp4} (${Math.round(fs.statSync(rawMp4).size / 1024)} KB)`);
  }

  console.log(`[cutout] Extracting transparent alpha WebM for '${character}/${name}'...`);
  runCutout(rawMp4, outWebm);
  const m = writeManifest(character);
  console.log(`[manifest] Ready ${character} clips (${m.clips.length}): ${m.clips.join(", ")}`);
  return true;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY in server/.env");
    process.exit(1);
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const charFlag = args.find((a) => a.startsWith("--character="));
  const character = charFlag ? charFlag.split("=")[1] : "oliver";
  const clipSet = CHARACTER_CLIP_SETS[character];
  if (!clipSet) {
    console.error(`Unknown character '${character}'. Expected 'oliver' or 'aria'.`);
    process.exit(1);
  }

  const cleanArgs = args.filter((a) => !a.startsWith("--"));
  const { standAnchor, sitAnchor, outDir } = pathsFor(character);
  const standPng = path.join(outDir, "anchor_stand.png");
  const sitPng = path.join(outDir, "anchor_sit.png");

  if ((force || !fs.existsSync(standPng)) && fs.existsSync(standAnchor)) {
    runCutout(standAnchor, standPng);
  }
  if ((force || !fs.existsSync(sitPng)) && fs.existsSync(sitAnchor)) {
    runCutout(sitAnchor, sitPng);
  }
  writeManifest(character);

  let targets = cleanArgs;
  if (args.includes("--all")) {
    targets = Object.keys(clipSet);
  } else if (args.includes("--core") || targets.length === 0) {
    targets = Object.entries(clipSet)
      .filter(([, s]) => s.core)
      .map(([k]) => k);
  }

  for (const name of targets) {
    const spec = clipSet[name];
    if (!spec) {
      console.warn(`Unknown clip '${name}' for ${character}, skipping.`);
      continue;
    }
    try {
      await generateClip(ai, character, name, spec, force);
    } catch (err) {
      console.error(`\n[error] Failed on '${character}/${name}':`, err?.message || err);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(String(err?.message || err))) {
        console.error("Stopping batch early due to video API rate/quota limit. Re-run later to resume remaining clips.");
        break;
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
