import { Router } from "express";
import { z } from "zod";
import { query } from "../db.js";

export const me = Router();

const toUser = (r: any) => ({
  displayName: r.display_name as string | null,
  character: r.character as string,
  focusMinutes: r.focus_minutes as number,
  breakMinutes: r.break_minutes as number,
  quizTopics: r.quiz_topics as string[],
});

me.get("/", async (req, res) => {
  const { rows } = await query("SELECT * FROM users WHERE clerk_id = $1", [req.userId]);
  res.json(toUser(rows[0]));
});

const Patch = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  character: z.string().trim().min(1).max(30).optional(),
  focusMinutes: z.number().int().min(1).max(120).optional(),
  breakMinutes: z.number().int().min(1).max(60).optional(),
  quizTopics: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
});

me.patch("/", async (req, res) => {
  const body = Patch.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const b = body.data;
  const { rows } = await query(
    `UPDATE users SET
       display_name  = COALESCE($2, display_name),
       character     = COALESCE($3, character),
       focus_minutes = COALESCE($4, focus_minutes),
       break_minutes = COALESCE($5, break_minutes),
       quiz_topics   = COALESCE($6, quiz_topics),
       updated_at    = now()
     WHERE clerk_id = $1 RETURNING *`,
    [req.userId, b.displayName ?? null, b.character ?? null, b.focusMinutes ?? null, b.breakMinutes ?? null, b.quizTopics ?? null],
  );
  res.json(toUser(rows[0]));
});
