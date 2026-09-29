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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/** Reads a line from the terminal without echoing it (raw mode). */
async function hiddenPrompt(q: string): Promise<string> {
  const stdin = process.stdin;
  process.stdout.write(q);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
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
