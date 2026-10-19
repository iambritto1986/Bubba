import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { query } from "./db.js";

declare global {
  namespace Express {
    interface Request { userId?: string }
  }
}

/** Rejects unauthenticated requests with 401 (no redirects — this is an API) and makes sure a users row exists. */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });
  req.userId = userId;
  await query("INSERT INTO users (clerk_id) VALUES ($1) ON CONFLICT (clerk_id) DO NOTHING", [userId]);
  next();
}
