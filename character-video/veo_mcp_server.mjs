/**
 * Zero-dependency MCP stdio server for Bubba's Path 1 Character Video + Transparent WebM pipeline.
 * Supports both `oliver` and `aria` via `gemini-omni-1.1-flash` using `server/.env`'s GEMINI_API_KEY.
 */

import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CHARACTER_CLIP_SETS, writeManifest } from "./generate_videos.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TOOLS = [
  {
    name: "list_character_clips",
    description:
      "List all Path 1 character expression/state clip definitions and which transparent .webm clips are currently generated in desktop/public/videos/<character>/.",
    inputSchema: {
      type: "object",
      properties: {
        character: {
          type: "string",
          enum: ["oliver", "aria"],
          description: "Companion character ('oliver' default, or 'aria').",
        },
      },
    },
  },
  {
    name: "generate_character_clip",
    description:
      "Generate a Pixar-style anchor-locked character clip (`Anchor A` standing or `Anchor B` sitting) and extract a transparent VP9 alpha .webm into desktop/public/videos/<character>/.",
    inputSchema: {
      type: "object",
      properties: {
        character: {
          type: "string",
          enum: ["oliver", "aria"],
          description: "Companion character ('oliver' default, or 'aria').",
        },
        clipName: {
          type: "string",
          description:
            "Clip name (e.g. 'flirty_wink', 'cheeky_smirk', 'warm_laugh', 'idle', 'talking', 'sit_down', 'sitting_focus', 'stand_up').",
        },
        force: {
          type: "boolean",
          description: "Regenerate even if the .webm already exists.",
        },
      },
      required: ["clipName"],
    },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handleCall(name, args = {}) {
  const character = args.character === "aria" ? "aria" : "oliver";
  const clipSet = CHARACTER_CLIP_SETS[character];

  if (name === "list_character_clips") {
    const manifest = writeManifest(character);
    const available = new Set(manifest.clips);
    const summary = Object.entries(clipSet).map(([k, spec]) => ({
      clip: k,
      transition: `${spec.start} -> ${spec.end}`,
      generated: available.has(k),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify({ character, manifest, clips: summary }, null, 2) }],
    };
  }

  if (name === "generate_character_clip") {
    const clipName = String(args.clipName || "").replace(/[^a-z0-9_-]/gi, "");
    if (!clipName) throw new Error("clipName is required");
    if (!clipSet[clipName]) {
      throw new Error(
        `Clip '${clipName}' is not defined for ${character}. Available: ${Object.keys(clipSet).join(", ")}`
      );
    }

    const scriptArgs = [
      path.join(ROOT, "character-video", "generate_videos.mjs"),
      `--character=${character}`,
      clipName,
    ];
    if (args.force) scriptArgs.push("--force");

    const res = spawnSync(process.execPath, scriptArgs, {
      cwd: ROOT,
      env: { ...process.env },
      encoding: "utf8",
      timeout: 300_000,
    });
    const logs = [res.stdout, res.stderr].filter(Boolean).join("\n");
    if (res.status !== 0) {
      return {
        isError: true,
        content: [{ type: "text", text: `Generation failed (code ${res.status}):\n${logs}` }],
      };
    }
    const manifest = writeManifest(character);
    return {
      content: [
        {
          type: "text",
          text: `Generated '${character}/${clipName}.webm' successfully.\nReady clips: ${manifest.clips.join(", ")}\n\nLogs:\n${logs}`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    return;
  }

  if (req.id === undefined || req.id === null) return;

  try {
    if (req.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          protocolVersion: req.params?.protocolVersion || "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "bubba-video", version: "1.1.0" },
        },
      });
    } else if (req.method === "ping") {
      send({ jsonrpc: "2.0", id: req.id, result: {} });
    } else if (req.method === "tools/list") {
      send({ jsonrpc: "2.0", id: req.id, result: { tools: TOOLS } });
    } else if (req.method === "tools/call") {
      const result = await handleCall(req.params?.name, req.params?.arguments);
      send({ jsonrpc: "2.0", id: req.id, result });
    } else {
      send({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: `Method not found: ${req.method}` },
      });
    }
  } catch (err) {
    send({
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32000, message: err?.message || String(err) },
    });
  }
});
