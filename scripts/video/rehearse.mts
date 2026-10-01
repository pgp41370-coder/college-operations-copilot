/**
 * Rehearses scripts/video/record-product.mts on a LOCAL production build with
 * a fresh local database (college_ops_rehearsal), so the production take
 * works first time. Credentials are generated here and never printed.
 *
 *   npm run build && npx tsx scripts/video/rehearse.mts
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import os from "node:os";
import postgres from "postgres";
import { migrate } from "../migrate";
import { createUser } from "../../src/lib/server/users";

const DB = "college_ops_rehearsal";
const PORT = 3700;
const URL = `postgres://${os.userInfo().username}@localhost:5432/${DB}`;
const ENV = { ...process.env, DATABASE_URL: URL, DATABASE_URL_UNPOOLED: "", PGUSER: "", PGPASSWORD: "", PGHOST: "", PGDATABASE: "" };

const admin = postgres(`postgres://${os.userInfo().username}@localhost:5432/postgres`, { max: 1, onnotice: () => {} });
await admin.unsafe(`drop database if exists ${DB} with (force)`);
await admin.unsafe(`create database ${DB}`);
await admin.end();
await migrate(URL, () => {});
const sql = postgres(URL, { max: 1, onnotice: () => {} });
const email = "rehearsal.admin@college.example";
const password = randomBytes(12).toString("base64url");
await createUser(sql, null, { email, name: "Rehearsal Admin", role: "admin", password });
await sql.end();

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: ENV, stdio: "ignore" });
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  execFileSync("npx", ["tsx", "scripts/video/record-product.mts", `--base-url=http://localhost:${PORT}`], {
    stdio: "inherit",
    env: { ...ENV, VIDEO_ADMIN_EMAIL: email, VIDEO_ADMIN_PASSWORD: password },
  });
} finally {
  server.kill();
}
