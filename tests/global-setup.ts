import postgres from "postgres";
import { migrate } from "../scripts/migrate";

export const TEST_DB_NAME = "college_ops_test";

/** Recreates the local test database and applies migrations. */
export default async function setup() {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://localhost:5432/postgres";
  const testUrl = process.env.TEST_DATABASE_URL ?? `postgres://localhost:5432/${TEST_DB_NAME}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists ${TEST_DB_NAME} with (force)`);
    await admin.unsafe(`create database ${TEST_DB_NAME}`);
  } finally {
    await admin.end();
  }
  await migrate(testUrl, () => {});
}
