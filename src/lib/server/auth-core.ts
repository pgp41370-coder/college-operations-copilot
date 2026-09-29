import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./types";

export const SESSION_COOKIE = "coc_session";
const SESSION_DAYS = 7;
const BCRYPT_COST = 11;

export interface User {
  id: string;
  email: string;
  name: string;
  role: "faculty" | "admin";
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) return "Password must be at least 10 characters.";
  if (password.length > 200) return "Password is too long.";
  return null;
}

// A real hash of a random value, so unknown emails cost the same time as known ones.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString("hex"), BCRYPT_COST);

export async function verifyCredentials(sql: Db, email: string, password: string): Promise<User | null> {
  const rows = await sql<(User & { password_hash: string; is_active: boolean })[]>`
    select id, email, name, role, password_hash, is_active from users where lower(email) = lower(${email})`;
  const row = rows[0];
  const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok || !row.is_active) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export async function createSession(sql: Db, userId: string): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await sql`insert into sessions (user_id, token_hash, expires_at) values (${userId}, ${hashToken(token)}, ${expires})`;
  await sql`delete from sessions where expires_at < now()`;
  return { token, expires };
}

export async function userForToken(sql: Db, token: string | undefined): Promise<User | null> {
  if (!token || token.length > 200) return null;
  const rows = await sql<User[]>`
    select u.id, u.email, u.name, u.role from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)} and s.expires_at > now() and u.is_active`;
  return rows[0] ?? null;
}

export async function destroySession(sql: Db, token: string | undefined) {
  if (token) await sql`delete from sessions where token_hash = ${hashToken(token)}`;
}

