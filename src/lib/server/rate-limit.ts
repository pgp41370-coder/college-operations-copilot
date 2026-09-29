import type { Db } from "./types";
import { AppError } from "./errors";

/**
 * Fixed-window limiter backed by Postgres (works across serverless instances).
 * Throws 429 when `limit` events for (bucket, key) exist inside the window.
 */
export async function rateLimit(sql: Db, bucket: string, key: string, limit: number, windowSeconds: number) {
  const since = new Date(Date.now() - windowSeconds * 1000);
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from rate_limit_events
    where bucket = ${bucket} and key = ${key} and created_at > ${since}`;
  if (n >= limit) {
    throw new AppError(429, "Too many attempts. Please wait a few minutes and try again.");
  }
  await sql`insert into rate_limit_events (bucket, key) values (${bucket}, ${key})`;
  if (Math.random() < 0.02) {
    await sql`delete from rate_limit_events where created_at < now() - interval '1 day'`;
  }
}

export async function clearRateLimit(sql: Db, bucket: string, key: string) {
  await sql`delete from rate_limit_events where bucket = ${bucket} and key = ${key}`;
}
