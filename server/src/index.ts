import "dotenv/config";
import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { migrate } from "./migrate.js";
import { requireUser } from "./auth.js";
import { me } from "./routes/me.js";
import { sessions } from "./routes/sessions.js";
import { quiz } from "./routes/quiz.js";
import { speak } from "./routes/speak.js";
import { voiceChat } from "./routes/voiceChat.js";

const origins = [
  "http://localhost:1420",   // Vite dev server inside Tauri
  "tauri://localhost",       // Tauri build (macOS/Linux)
  "http://tauri.localhost",  // Tauri build (Windows)
  "https://tauri.localhost",
  "https://singularityinsight.com",
  "https://www.singularityinsight.com",
  "https://bubba.singularityinsight.com",
  ...(process.env.EXTRA_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
];

const app = express();
app.use(cors({ origin: origins }));
app.use(express.json({ limit: "100kb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(clerkMiddleware());
app.use("/api", requireUser);
app.use("/api/me", me);
app.use("/api/sessions", sessions);
app.use("/api/quiz", quiz);
app.use("/api/speak", speak);
app.use("/api/voice", voiceChat);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal error" });
});

const port = Number(process.env.PORT) || 8787;
migrate()
  .then(() => app.listen(port, () => console.log(`Bubba API on :${port}`)))
  .catch((err) => {
    console.error("Migration failed", err);
    process.exit(1);
  });
