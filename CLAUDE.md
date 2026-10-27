# CLAUDE.md — Bubba Desktop Companion

This file gives Claude (Claude Code / Claude Desktop) complete project context, architecture decisions, visual standards, and budget guardrails for **Bubba**.

---

## 1. Product Vision: What We Are Building

Bubba is **not** a static timer widget — it is a **miniature living person on the user's Windows desktop**:
- **Companions ("One brain, many skins"):**
  - **Oliver:** Charming royal gentleman butler (light British poise, quietly witty, navy gold-piped tailcoat, burgundy bow tie, waistcoat, white gloves, brass pocket watch).
  - **Aria:** Warm, graceful companion (storybook-queen evening poise, soft chestnut-auburn waves, emerald-green eyes, flowing dusty-rose gold-piped dress, burgundy-gold leather notebook & gold fountain pen).
- **Desktop Life & Spatial Behavior:**
  - Lives directly above the Windows taskbar in a frameless, transparent, always-on-top Tauri window (`desktop/src-tauri/`).
  - **Walks across the screen** (`window.setPosition`) to the corner when a Pomodoro focus session starts and **sits down on the taskbar edge** (e.g., checking his brass pocket watch or taking notes while keeping quiet company).
  - **Local Wake Word:** Listens locally on-device (e.g., *"Hey Oliver"* / *"Hey Aria"*). On wake word, stands up, faces the user attentively, and opens voice conversation.
  - **Screen Awareness:** Notices what the user is working on (active window title + occasional lightweight visual check) so it can gently nudge if they drift off-task during focus mode or celebrate completed work.

---

## 2. Character Visual Direction (IMPORTANT — Read Before Touching 3D/Blender)

### Why We Are Moving Beyond Procedural Blender (`character3d/`)
- Earlier experiments built `oliver.glb` and `aria.glb` procedurally in Blender 5.2 using MPFB 2 (MakeHuman) + Python-scripted bone keyframes (`desktop/src/components/characters/Character3D.tsx`).
- While functional (and currently wired with Three.js + 2D fallback), procedural MakeHuman meshes look like **stiff clay/plastic mannequins** rather than expressive Disney/Pixar characters, and hiring an external 3D artist is **out of budget**.
- **Continuous 24/7 eyeball-to-mouse tracking is NOT required** (and is distracting during deep work). Situational actions (walking left/right, sitting in the corner, waking up on wake word, expressive talking/listening/cheering) matter far more.

### Visual Target & Reference Sheets (Inspect These First!)
Always match the approved Disney/Pixar-level visual bar in `docs/character-refs/`:
- `docs/character-refs/oliver_concept_ref.jpg` — Master character identity & wardrobe reference for Oliver.
- `docs/character-refs/oliver_path1_anchors.jpg` — **Oliver Path 1 Anchor Poses**:
  - **Anchor A (Left):** Standing Ready neutral pose (front-facing, clasped white-gloved hands, warm smile).
  - **Anchor B (Right):** Sitting on the taskbar corner ledge checking his brass pocket watch during focus mode.
- `docs/character-refs/oliver_path1_states.jpg` — **Oliver Expression & Motion Lineup**: Wake Word (*"Yes?"* hand on heart), Thinking (hand on chin), Talking/Explaining, and Cheering.
- `docs/character-refs/aria_path1_anchors.jpg` — **Aria Path 1 Anchor Poses**:
  - **Anchor A (Left):** Standing Ready in her flowing dusty-rose gold-piped evening dress, soft chestnut-auburn waves, emerald-green eyes, warm poised smile.
  - **Anchor B (Right):** Sitting on the taskbar corner ledge holding her burgundy-gold leather notebook & gold fountain pen during focus mode.

### Approved Animation Architecture: Path 1 — Anchor-Locked Transparent Video State Machine
Instead of sculpting/rigging clay meshes in Python, we animate high-fidelity Pixar character renders into **transparent `.webm` (`VP9` with alpha) video loops and transitions** using **First-Frame + Last-Frame conditioning** so clips never jump-cut:
1. **Standing Loops (`Anchor A -> Anchor A`):** `idle`, `listening`, `thinking`, `talking` (played/gated while ElevenLabs `useSpeaking()` / `useVoiceLevel()` is active, returning smoothly to `Anchor A` on pauses), `cheering`, and `walk` (flipped horizontally via `scaleX(-1)` for left vs. right movement while Tauri moves the window).
2. **Corner Sitting Flow (`Anchor A <-> Anchor B`):**
   - `sit_down.webm` (`Anchor A -> Anchor B`) when arriving at the corner for a focus session.
   - `sitting_focus.webm` (`Anchor B -> Anchor B`) quiet loop while timer runs.
   - `stand_up.webm` (`Anchor B -> Anchor A`) when woken by wake word, click, or timer check-in.
3. **Background Removal:** Strip the clean studio grey/chromakey backdrop via Python (`rembg` / `BiRefNet`) and encode with `ffmpeg` (`libvpx-vp9 -pix_fmt yuva420p`) into lightweight transparent `.webm` assets in `desktop/public/videos/`.

### Unlocked Google GenAI Models Already Available in This Repo
`server/.env` already contains a working `GEMINI_API_KEY` (with `@google/genai` v2.30+ installed in `server/package.json`):
- **`models/gemini-omni-1.1-flash` (Video Generation via Interactions API):** Note that `veo-3.1-*-preview` endpoints were retired in October 2026 in favor of `gemini-omni-1.1-flash` via `ai.interactions.create({ model: "gemini-omni-1.1-flash", input: [...], generation_config: { video_config: { task: "image_to_video" } } })`, returning `interaction.output_video`.
- **`models/gemini-3-pro-image` & `models/gemini-nano-banana-2.1`:** Character-consistent image generation & pose/expression editing.
- **`models/gemini-3.6-flash` / `models/gemini-3.8-flash`:** Fast multimodal reasoning & quiz generation.

### Character Video & Expression Pipeline (`character-video/` & `desktop/`)
- **Local `$0` 2.5D Pixar Clip Synthesizer (`character-video/synthesize_local_clips.py`):**
  - Run via `uv run --with pillow --with numpy --with scipy --with imageio-ffmpeg python character-video/synthesize_local_clips.py --character <oliver|aria|all>`.
  - Synthesizes all 18 halo-free transparent `.webm` (`VP9` `yuva420p`) clips per character (`idle`, `talking`, `listening`, `thinking`, `walk`, `sit_down`, `sitting_focus`, `stand_up`, plus all 10 reactions in `REACTIONS`) directly from `desktop/public/videos/<character>/anchor_stand.png` & `anchor_sit.png` for `$0` API cost, and writes `manifest.json`. Both `oliver` and `aria` (36 clips total) are already generated.
- **Cloud Video Generator CLI (`character-video/generate_videos.mjs`):**
  - `node character-video/generate_videos.mjs --character=<oliver|aria> <clipNames... | --core | --all>` calls `models/gemini-omni-1.1-flash` (`image_to_video` via Interactions API) from `character-video/anchors/<character>_anchor_a_stand.png` & `_anchor_b_sit.png`, then runs `character-video/cutout_video.py` (`rembg` `u2net_human_seg` + edge color decontamination + `imageio-ffmpeg` `libvpx-vp9 -pix_fmt yuva420p`).
  - *Note:* `models/gemini-omni-1.1-flash` requires a Tier 1+ (paid billing) AI Studio API key (`Free Tier` has `0` video tokens/min quota). Until Tier 1 billing is enabled on `server/.env`'s `GEMINI_API_KEY`, `synthesize_local_clips.py` provides immediate smooth animated clips.
- **Claude Desktop MCP (`bubba-video`):** Registered in `claude_desktop_config.json` (`character-video/veo_mcp_server.mjs`), exposing `list_character_clips` and `generate_character_clip` for both `oliver` and `aria`.
- **Frontend Player (`desktop/src/components/characters/CharacterVideo.tsx`):**
  - Renders base loop (`idle`, `listening`, `thinking`, `walk`, or `sitting_focus`), an audio-gated `talking` video layer driven at 60fps by `useVoiceLevel()`, and one-shot expression/transition overlays (`flirty_wink`, `cheeky_smirk`, `warm_laugh`, `flattered`, `gentleman_bow`, `proud_cheer`, `sympathetic`, `surprised`, `caught_you`, `sleepy_yawn`, `sit_down`, `stand_up`). Supports `framing="bust"` for `CharacterPicker` and tucked peek mode.
  - Toggle switches: `localStorage.bubba_video = "0"` falls back to `Character3D`; `localStorage.bubba_3d = "0"` falls back to 2D `Person`.
- **Live Expressions (`desktop/src/lib/expressions.ts`):**
  - Triggered both via the ElevenLabs non-blocking client tool `express({ reaction })` in `conversation.ts` / `Buddy.tsx` AND via automatic conversational cue matching (`inferReactionFromText`) on `userLine` / `agentLine`, plus the hover `✨` quick-emote tester in `App.tsx` and `window.bubbaExpress("<reaction>")`.

---

## 3. Strict Budget & API Cost Guardrails

The user has already invested heavily in ElevenLabs API credits. **Respect cost efficiency in every design decision:**
1. **NEVER hold ElevenLabs Conversational AI WebSockets open while idle or focusing.**
   - Wake-word detection (*"Hey Oliver"* / *"Hey Aria"*) **must run 100% locally on-device for $0/hr** (e.g., `openWakeWord`, `sherpa-onnx`, or lightweight Rust/Web audio keyword spotting).
   - Connect ElevenLabs (`startChat` in `desktop/src/lib/conversation.ts`) **only** when triggered by the wake word or mic button, and auto-disconnect (`stopChat`) promptly once the interaction concludes or `tuck_away` fires.
2. **Cache one-off TTS lines:** `desktop/src/lib/voice.ts` caches `/api/speak` blobs in memory; preserve or persist caching for repeated short lines (*"Time's up"* etc.) so identical phrases aren't re-billed.
3. **Screen awareness must be cheap-first:**
   - Check active window title / process name natively via Tauri/Win32 first (**$0**, zero network).
   - Only capture & send a downscaled/compressed screenshot to Gemini Flash when visual inspection is actually needed (e.g., verifying if the user is stuck or off-task), never on a tight polling loop.

---

## 4. Codebase Map

```text
Bubba/
├─ CLAUDE.md                        Project context, visual direction & cost guardrails
├─ Launch Bubba.bat                 One-click Windows launcher (release bubba.exe -> Vite + debug fallback)
├─ docs/character-refs/             Approved Pixar-style Oliver & Aria visual & anchor references
├─ character-video/                 Path 1 Pixar video & cutout pipeline + Claude MCP server
│  ├─ anchors/                      oliver & aria 9:16 stand/sit studio anchors
│  ├─ cutout_video.py               rembg (u2net_human_seg) + edge decontam + VP9 yuva420p
│  ├─ synthesize_local_clips.py     Local $0 2.5D Pixar clip synthesizer (`--character oliver|aria|all`)
│  ├─ generate_videos.mjs           Cloud gemini-omni-1.1-flash video generator CLI (`--character=aria`)
│  └─ veo_mcp_server.mjs            Stdio MCP server ("bubba-video") for Claude Desktop
├─ character3d/README.md            Docs for earlier Blender/Three.js rig (heavy scratch files gitignored)
├─ desktop/                         Tauri 2 + React 19 + Vite 8 + Tailwind 4 + Motion
│  ├─ public/videos/oliver/         manifest.json + 18 transparent .webm clips + anchor PNGs
│  ├─ public/videos/aria/           manifest.json + 18 transparent .webm clips + anchor PNGs
│  ├─ public/models/                oliver.glb, aria.glb (3D fallback assets)
│  ├─ src/
│  │  ├─ App.tsx                    Auth gate, Shell layout, toolbar + ✨ emote quick-tester
│  │  ├─ components/
│  │  │  ├─ Bubba.tsx               Companion switcher (CharacterVideo -> Character3D -> Person)
│  │  │  ├─ Buddy.tsx               Main Pomodoro loop, ElevenLabs chat tools (`express`), captions
│  │  │  ├─ CharacterPicker.tsx     Oliver / Aria companion selector
│  │  │  └─ characters/
│  │  │     ├─ CharacterVideo.tsx   Path 1 transparent WebM state machine + 60fps lip-sync
│  │  │     ├─ Character3D.tsx      Three.js / R3F GLB fallback player (gaze, morphs, quirks)
│  │  │     ├─ Person.tsx           2D SVG fallback for Oliver & Aria
│  │  │     ├─ Plush.tsx            Default plush mascot before companion selection
│  │  │     └─ rig.tsx              useLive() state hook (mood, listening, thinking, talking, level, blink)
│  │  └─ lib/
│  │     ├─ characters.ts           Oliver & Aria personas, ElevenLabs voiceIds, greetings
│  │     ├─ conversation.ts         ElevenLabs Conversational AI live session + client tools
│  │     ├─ expressions.ts          10 reactions, triggerExpression(), transcript cue matcher
│  │     ├─ voice.ts                One-off /api/speak TTS playback + WebAudio RMS loudness meter
│  │     ├─ quirks.ts               playQuirk() / onQuirk() event bus
│  │     ├─ tuck.ts                 Corner peek / tuck-away window resize & positioning
│  │     ├─ windowCtl.ts            Tauri window sizing, dragging & walkWindowToCorner()
│  │     └─ usePomodoro.ts          Focus / check-in / break timer state machine
│  └─ src-tauri/                    Rust shell: transparent always-on-top window + system tray
└─ server/                          Express 5 + TypeScript + Clerk + Postgres + Gemini API
   └─ src/                          API routes (/api/me, /api/sessions, /api/quiz, /api/voice, /api/speak)
```

---

## 5. Local Development & Windows Gotchas

- **PowerShell `npm` policy:** Windows PowerShell on this machine blocks `npm.ps1`. Run `npm.cmd` (e.g., `npm.cmd --prefix desktop run build` or `npm.cmd --prefix desktop run tauri dev`) or invoke via `cmd /c`.
- **Running the Desktop App (IMPORTANT — Sandbox & WebView2 Lock Gotcha):**
  - **User One-Click Launcher:** `Launch Bubba.bat` in the repo root clears any stale `bubba.exe` process and launches `desktop/src-tauri/target/release/bubba.exe` (self-contained standalone build, no dev server needed) or falls back to `debug/bubba.exe` after ensuring Vite (`http://localhost:1420`) is up.
  - **Do NOT spawn `tauri dev` from a sandboxed agent background shell:** Agent sandboxes on Windows run inside an isolated hidden desktop (`WinSta0\...`). Launching `bubba.exe` there hides the GUI window from the user's real screen *and* locks `AppData\Local\com.singularityinsight.bubba\EBWebView`, blocking the user from opening `bubba.exe` themselves. Instead, either build `npm.cmd --prefix desktop run tauri build -- --no-bundle` (for standalone `release\bubba.exe`) or run only `npm.cmd --prefix desktop run dev` (Vite) and let the user launch `Launch Bubba.bat`.
  - Also note: because `tauri.conf.json` sets `transparent: true, decorations: false`, launching `debug\bubba.exe` when `localhost:1420` is down produces a completely invisible window.
  - `desktop/.env.local` points `VITE_API_URL` at `https://bubba-api.onrender.com` by default, so the local `server/` only needs to run if testing new backend endpoints.
- **Git Hygiene:** Keep `character3d/*` (except `character3d/README.md`) ignored in `.gitignore` — `character3d/` holds ~350 MB of local `.npy` maps, `.blend` backups, and debug renders that must never be committed.
- **Claude Desktop Config Path (MSIX migrated):** `C:\Users\itsme\AppData\Local\Claude-Data\claude_pzs8sxrjxfjjc\claude_desktop_config.json`.
