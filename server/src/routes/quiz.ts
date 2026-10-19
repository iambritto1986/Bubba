import { Router } from "express";
import { z } from "zod";
import { query } from "../db.js";
import { generateQuiz } from "../gemini.js";

export const quiz = Router();

const DEFAULT_TOPICS = ["general knowledge", "science", "world geography", "history", "animals", "space", "words and language"];

quiz.post("/", async (req, res) => {
  const { rows: [user] } = await query("SELECT quiz_topics FROM users WHERE clerk_id = $1", [req.userId]);
  const pool: string[] = user?.quiz_topics?.length ? user.quiz_topics : DEFAULT_TOPICS;
  const topic = pool[Math.floor(Math.random() * pool.length)];
  const { rows: recent } = await query(
    "SELECT question FROM quiz_items WHERE clerk_id = $1 ORDER BY created_at DESC LIMIT 15",
    [req.userId],
  );

  try {
    const item = await generateQuiz(topic, recent.map((r) => r.question));
    const { rows } = await query(
      `INSERT INTO quiz_items (clerk_id, topic, question, choices, correct_index, explanation)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [req.userId, topic, item.question, JSON.stringify(item.choices), item.correctIndex, item.explanation],
    );
    // The answer stays on the server until the user picks.
    res.status(201).json({ id: String(rows[0].id), topic, question: item.question, choices: item.choices });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Bubba couldn't think of a question right now" });
  }
});

quiz.post("/:id/answer", async (req, res) => {
  const body = z.object({ chosenIndex: z.number().int().min(0).max(3) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const { rows } = await query(
    `UPDATE quiz_items SET chosen_index = $3, answered_at = now()
      WHERE id = $1 AND clerk_id = $2 AND chosen_index IS NULL
      RETURNING correct_index, explanation`,
    [req.params.id, req.userId, body.data.chosenIndex],
  );
  if (!rows.length) return res.status(404).json({ error: "not found or already answered" });
  res.json({
    correct: rows[0].correct_index === body.data.chosenIndex,
    correctIndex: rows[0].correct_index,
    explanation: rows[0].explanation,
  });
});
