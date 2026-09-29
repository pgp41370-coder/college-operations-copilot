import postgres from "postgres";

export type Sql = postgres.Sql;

declare global {
  var __cocSql: Sql | undefined;
}

export function createSql(url: string): Sql {
  return postgres(url, {
    max: process.env.NODE_ENV === "production" ? 3 : 5,
    idle_timeout: 20,
    connect_timeout: 15,
    // Transaction-mode poolers (Neon/Supabase pooled URLs) do not support
    // prepared statements.
    prepare: false,
    onnotice: () => {},
  });
}

/** Thrown when the deployment has no database configured. */
export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured. See SETUP.md.");
    this.name = "DatabaseNotConfiguredError";
  }
}

/** Lazily-created shared connection. Throws a clear error when unconfigured. */
export function getSql(): Sql {
  if (!globalThis.__cocSql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new DatabaseNotConfiguredError();
    }
    globalThis.__cocSql = createSql(url);
  }
  return globalThis.__cocSql;
}

/** Test hook: point the shared connection at a specific database. */
export function setSqlForTests(sql: Sql | undefined) {
  globalThis.__cocSql = sql;
}
