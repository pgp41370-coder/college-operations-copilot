/**
 * Sets a new password for an existing account (e.g. a forgotten admin password).
 *
 *   DATABASE_URL=... npx tsx scripts/reset-password.ts --email you@college.edu
 *
 * The new password is read from a hidden prompt — never from the command line,
 * so it is not saved in shell history. Existing sessions of the account are
 * signed out and the reset is recorded in the audit log.
 */
import postgres from "postgres";
import { hashPassword, validatePasswordStrength } from "../src/lib/server/auth-core";
import { audit } from "../src/lib/server/audit";
import { hiddenPrompt } from "./lib/prompt";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = process.env.DATABASE_URL;
  const email = arg("email")?.trim().toLowerCase();
  if (!url || !email) {
    console.error("Usage: DATABASE_URL=... npx tsx scripts/reset-password.ts --email <email>");
    process.exit(1);
  }
  if (!process.stdin.isTTY) {
    console.error("Run this in a terminal: the new password is typed into a hidden prompt.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [user] = await sql<{ id: string; is_active: boolean }[]>`select id, is_active from users where lower(email) = ${email}`;
    if (!user) throw new Error(`No account with the email ${email}.`);
    const password = await hiddenPrompt("New password (min. 10 characters): ");
    const weak = validatePasswordStrength(password);
    if (weak) throw new Error(weak);
    if ((await hiddenPrompt("Repeat the new password: ")) !== password) throw new Error("The passwords do not match. Nothing was changed.");
    await sql.begin(async (tx) => {
      await tx`update users set password_hash = ${await hashPassword(password)}, updated_at = now() where id = ${user.id}`;
      await tx`delete from sessions where user_id = ${user.id}`;
      await audit(tx, { actorId: null, action: "user.updated", entityType: "user", entityId: user.id, details: { passwordReset: true, via: "reset-password script" } });
    });
    console.log(`Password updated for ${email}.${user.is_active ? "" : " Note: this account is deactivated — an admin must reactivate it before it can sign in."}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
