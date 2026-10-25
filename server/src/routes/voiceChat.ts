import { Router } from "express";

/**
 * Two-way voice chat with Bubba (ElevenLabs Agents).
 * The desktop app asks for a short-lived conversation token; the API key and agent id never leave the server.
 */
export const voiceChat = Router();

const KEY = process.env.ELEVENLABS_API_KEY;
const AGENT = process.env.ELEVENLABS_AGENT_ID || "agent_5801m5rjhr0webbbejbcg2szxhmz"; // "Bubba"

voiceChat.post("/token", async (_req, res) => {
  if (!KEY) return res.status(503).json({ error: "voice not configured" });
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${AGENT}`, {
    headers: { "xi-api-key": KEY },
  });
  if (!r.ok) {
    console.error("ElevenLabs token", r.status, await r.text().catch(() => ""));
    return res.status(502).json({ error: "Bubba can't open a voice line right now" });
  }
  const { token } = (await r.json()) as { token: string };
  res.json({ token });
});
