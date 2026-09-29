/**
 * Creates a user account directly in the database (first admin bootstrap).
 *
 *   DATABASE_URL=... npx tsx scripts/create-user.ts --email you@college.edu --name "Your Name" --role admin
 *
 * The password is read from a hidden prompt, or from NEW_USER_PASSWORD when
 * not running in a terminal. It is never accepted as a command-line argument
 * (which would be saved in shell history).
 */
import postgres from "postgres";
import { createUser } from "../src/lib/server/users";
import { hiddenPrompt } from "./lib/prompt";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = process.env.DATABASE_URL;
  const email = arg("email");
  const name = arg("name");
  const role = (arg("role") ?? "faculty") as "faculty" | "admin";
  if (!url || !email || !name || !["faculty", "admin"].includes(role)) {
    console.error('Usage: DATABASE_URL=... npx tsx scripts/create-user.ts --email <email> --name "<name>" --role admin|faculty');
    process.exit(1);
  }
  const password = process.env.NEW_USER_PASSWORD ?? (process.stdin.isTTY ? await hiddenPrompt("Password (min. 10 characters): ") : "");
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const id = await createUser(sql, null, { email, name, role, password });
    console.log(`Created ${role} ${email} (${id}).`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
