import { Router } from "express";
import { z } from "zod";

/**
 * Text-to-speech in Bubba's voice (ElevenLabs). The key stays on the server.
 * Lines are cached in memory so repeated lines ("What should I call you?") cost nothing.
 */
export const speak = Router();

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID || "hRbsi7Sgd2GnL8siHYj9"; // "Bubba Voice"
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";       // low latency

const cache = new Map<string, Buffer>();
const MAX_CACHE = 300;

speak.post("/", async (req, res) => {
  if (!KEY) return res.status(503).json({ error: "voice not configured" });
  const body = z.object({
    text: z.string().trim().min(1).max(600),
    voiceId: z.string().regex(/^[A-Za-z0-9]{10,40}$/).optional(), // the chosen companion's voice
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const text = body.data.text;
  const voice = body.data.voiceId ?? VOICE;
  const key = `${voice}|${text}`;

  let audio = cache.get(key);
  if (!audio) {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": KEY, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: MODEL,
          voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
        }),
      },
    );
    if (!r.ok) {
      console.error("ElevenLabs", r.status, await r.text().catch(() => ""));
      return res.status(502).json({ error: "Bubba lost his voice" });
    }
    audio = Buffer.from(await r.arrayBuffer());
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, audio);
  }
  res.set({ "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" }).send(audio);
});
