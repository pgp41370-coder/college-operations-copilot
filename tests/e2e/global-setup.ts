import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { migrate } from "../../scripts/migrate";
import { createUser } from "../../src/lib/server/users";

/** Fresh E2E database with two faculty users. Credentials stay in .cache (git-ignored). */
export default async function setup() {
  if (process.env.E2E_BASE_URL) return;
  const db = "college_ops_e2e";
  const admin = postgres("postgres://localhost:5432/postgres", { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${db} with (force)`);
  await admin.unsafe(`create database ${db}`);
  await admin.end();
  const url = `postgres://localhost:5432/${db}`;
  await migrate(url, () => {});
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const users = [];
  for (const who of ["a", "b"]) {
    const password = randomBytes(12).toString("base64url");
    const email = `faculty-${who}@e2e.test`;
    await createUser(sql, null, { email, name: `E2E Faculty ${who.toUpperCase()}`, role: "faculty", password });
    users.push({ email, password });
  }
  await sql.end();
  mkdirSync(".cache", { recursive: true });
  writeFileSync(".cache/e2e-users.json", JSON.stringify(users));
}
