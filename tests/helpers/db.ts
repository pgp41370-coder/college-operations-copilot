import { randomBytes } from "node:crypto";
import postgres from "postgres";
import type { User } from "../../src/lib/server/auth-core";
import { createUser } from "../../src/lib/server/users";

export const testUrl = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/college_ops_test";

export function testSql() {
  return postgres(testUrl, { max: 4, prepare: false, onnotice: () => {} });
}

/** Creates a user with a random password (returned so tests can log in). */
export async function makeUser(sql: postgres.Sql, role: "faculty" | "admin" = "faculty"): Promise<User & { password: string }> {
  const password = randomBytes(12).toString("base64url");
  const email = `${role}-${randomBytes(4).toString("hex")}@test.invalid`;
  const id = await createUser(sql, null, { email, name: `Test ${role} ${email.slice(-12, -8)}`, role, password });
  return { id, email, name: `Test ${role}`, role, password };
}
