import { useAuth } from "@clerk/react";
import { useCallback } from "react";
import { API_URL } from "./env";

export type Profile = {
  displayName: string | null;
  character: string;
  focusMinutes: number;
  breakMinutes: number;
  quizTopics: string[];
};
export type QuizQuestion = { id: string; topic: string; question: string; choices: string[] };
export type QuizResult = { correct: boolean; correctIndex: number; explanation: string };

/** fetch() with the Clerk session token attached. */
export function useApi() {
  const { getToken } = useAuth();
  return useCallback(
    async <T,>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
      const token = await getToken();
      const res = await fetch(`${API_URL}${path}`, {
        method: init.method ?? "GET",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      return res.json() as Promise<T>;
    },
    [getToken],
  );
}
