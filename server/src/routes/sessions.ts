import { Router } from "express";
import { z } from "zod";
import { query } from "../db.js";

export const sessions = Router();

const Start = z.object({
  intention: z.string().trim().max(200).optional(),
  plannedMinutes: z.number().int().min(1).max(120),
});

sessions.post("/", async (req, res) => {
  const body = Start.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const { rows } = await query(
    "INSERT INTO focus_sessions (clerk_id, intention, planned_minutes) VALUES ($1, $2, $3) RETURNING id",
    [req.userId, body.data.intention || null, body.data.plannedMinutes],
  );
  res.status(201).json({ id: String(rows[0].id) });
});

sessions.patch("/:id", async (req, res) => {
  const body = z.object({ completed: z.boolean() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const { rowCount } = await query(
    "UPDATE focus_sessions SET completed = $3, ended_at = now() WHERE id = $1 AND clerk_id = $2",
    [req.params.id, req.userId, body.data.completed],
  );
  if (!rowCount) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

/** Today's tally for Bubba to brag about. */
sessions.get("/today", async (req, res) => {
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE completed) AS done,
            COALESCE(sum(planned_minutes) FILTER (WHERE completed), 0) AS minutes
       FROM focus_sessions
      WHERE clerk_id = $1 AND started_at >= now() - interval '24 hours'`,
    [req.userId],
  );
  res.json({ sessions: Number(rows[0].done), minutes: Number(rows[0].minutes) });
});
