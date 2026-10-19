import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// Render's external URLs require TLS; its internal URLs (used on Render) do not.
const needsSsl = /render\.com/.test(url) || process.env.PGSSL === "true";

export const pool = new pg.Pool({
  connectionString: url,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: 5,
});

export async function query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}
