import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

export const QuizItem = z.object({
  question: z.string().min(5).max(300),
  choices: z.array(z.string().min(1).max(120)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(5).max(400),
});
export type QuizItem = z.infer<typeof QuizItem>;

const schema = {
  type: "object",
  properties: {
    question: { type: "string" },
    choices: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
    correctIndex: { type: "integer", minimum: 0, maximum: 3 },
    explanation: { type: "string" },
  },
  required: ["question", "choices", "correctIndex", "explanation"],
};

/** One break-time multiple-choice question. `avoid` keeps Bubba from repeating himself. */
export async function generateQuiz(topic: string, avoid: string[]): Promise<QuizItem> {
  const prompt = [
    `You are Bubba, a friendly cartoon hippo who quizzes people during short Pomodoro breaks.`,
    `Write ONE multiple-choice question about: ${topic}.`,
    `Make it answerable in under 20 seconds, fun, and factually correct. Exactly 4 short choices, one correct.`,
    `Keep the explanation to one or two upbeat sentences that teach the fact.`,
    avoid.length ? `Do not repeat or closely paraphrase any of these earlier questions:\n- ${avoid.join("\n- ")}` : "",
  ].join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { responseMimeType: "application/json", responseJsonSchema: schema, temperature: 1 },
    });
    try {
      const parsed = QuizItem.safeParse(JSON.parse(res.text ?? "{}"));
      if (parsed.success) return parsed.data;
    } catch {
      // malformed JSON — retry once
    }
  }
  throw new Error("Gemini returned an invalid quiz item");
}
