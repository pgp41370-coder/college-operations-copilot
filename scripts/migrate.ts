/**
 * Applies SQL migrations in db/migrations in filename order, once each.
 * Usage: DATABASE_URL=... npx tsx scripts/migrate.ts
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { seedTemplates } from "../src/lib/templates/seed";

export async function migrate(url: string, log = console.log) {
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql`create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`;
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Set(
      (await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name),
    );
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = await readFile(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      log(`applied ${file}`);
    }
    const seeded = await seedTemplates(sql);
    if (seeded.length) log(`seeded templates: ${seeded.join(", ")}`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  // DDL should use a direct (non-pooled) connection when one is provided
  // (Neon sets DATABASE_URL_UNPOOLED); the app itself uses the pooled URL.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    if (process.argv.includes("--if-configured")) {
      console.warn("DATABASE_URL is not set: skipping migrations. The app will report that the database is not configured.");
      process.exit(0);
    }
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  migrate(url)
    .then(() => console.log("migrations complete"))
    .catch((err) => {
      console.error("migration failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
