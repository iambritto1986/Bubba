# Bubba — desktop focus buddy

A cartoon hippo that floats on your desktop, runs Pomodoro sessions, and quizzes you on breaks.

```
Bubba/
├─ desktop/   Tauri 2 + React 19 + Vite + Tailwind 4 + Motion   (the floating Bubba window)
│  └─ src-tauri/   Rust shell: transparent always-on-top window, tray icon
├─ server/    Express 5 + TypeScript API                        (deploys to Render)
│  └─ migrations/  plain SQL, run automatically on boot
└─ render.yaml   Render Blueprint: bubba-api web service + bubba-db Postgres
```

**Auth:** Clerk (React SDK in the window, `@clerk/express` on the API).
**Database:** Render Postgres via `pg`.
**Intelligence:** Gemini via `@google/genai`, called only from the server so the key never ships in the app.

## One-time setup (Windows)

1. **Rust** — install from https://rustup.rs (accept the defaults; it pulls the MSVC build tools). WebView2 is already on Windows 10/11.
2. **Clerk** — create an application at dashboard.clerk.com. Copy the publishable key (`pk_test_…`) and secret key (`sk_test_…`).
3. **Gemini** — get an API key from aistudio.google.com.
4. **Database** — either deploy the Blueprint (below) and copy the database's *External* connection string, or point `DATABASE_URL` at any Postgres.

```bash
# API
cd server
cp .env.example .env      # fill in Clerk, DATABASE_URL, Gemini
npm install
npm run dev               # http://localhost:8787  (migrations run on start)

# Desktop (second terminal)
cd desktop
cp .env.example .env.local   # VITE_CLERK_PUBLISHABLE_KEY, VITE_API_URL
npm install
npm run tauri dev
```

`npm run dev` inside `desktop/` also works in a normal browser at http://localhost:1420 — handy for UI work.

## Deploying the API to Render

Push the repo to GitHub, then in Render: **New → Blueprint → pick the repo**. It creates `bubba-api` and `bubba-db` and wires `DATABASE_URL` automatically; it will ask for `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and `GEMINI_API_KEY`. Then set `VITE_API_URL` in `desktop/.env.local` to the service URL.

Both are on Render's free plans in `render.yaml`. Free Postgres expires after a set period, so move to a paid plan before real users.

## API

All `/api/*` routes need a Clerk session token (`Authorization: Bearer …`).

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Liveness (no auth) |
| GET / PATCH | `/api/me` | Profile: display name, character, focus/break minutes, quiz topics |
| POST | `/api/sessions` | Start a focus session `{ intention?, plannedMinutes }` |
| PATCH | `/api/sessions/:id` | End it `{ completed }` |
| GET | `/api/sessions/today` | Sessions and minutes in the last 24h |
| POST | `/api/quiz` | Gemini writes one question (answer stays server-side) |
| POST | `/api/quiz/:id/answer` | `{ chosenIndex }` → correct?, explanation |

## What's in v0.1 / what's next

Done: floating draggable Bubba (SVG placeholder with moods), tray icon (show/quit), Clerk sign-in, first-run intro that asks your name, Pomodoro with intention + "did you finish?", Gemini break quizzes that avoid repeats, Postgres persistence.

Next: Rive character to replace the SVG, ElevenLabs voice, settings panel (timers, quiz topics, character), streaks/stats, auto-launch on login, production sign-in flow for packaged builds (see note).

> **Packaged-build sign-in:** Clerk's React components work in `tauri dev` (served from localhost) with a Clerk *development* instance. For a production Clerk instance inside an installed app, plan on a browser hand-off sign-in (open the system browser, deep-link back) — to do before the first public build.
