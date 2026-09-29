import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { EXPECTED_TABLES, LATEST_MIGRATION, schemaStatus } from "@/lib/server/schema-status";
import { testSql } from "../helpers/db";

const dir = path.join(process.cwd(), "db", "migrations");
const sql = testSql();
afterAll(async () => sql.end());

describe("schema status", () => {
  it("LATEST_MIGRATION matches the newest migration file", () => {
    expect(readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().pop()).toBe(LATEST_MIGRATION);
  });
  it("EXPECTED_TABLES matches the tables created by the migrations", () => {
    const created = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .flatMap((f) => [...readFileSync(path.join(dir, f), "utf8").matchAll(/create table (\w+)/g)].map((m) => m[1]));
    expect([...created].sort()).toEqual([...EXPECTED_TABLES].sort());
  });
  it("reports a freshly migrated database as current and complete", async () => {
    const s = await schemaStatus(sql);
    expect(s).toMatchObject({ migrations: "current", missingTables: [], tablesPresent: EXPECTED_TABLES.length });
    expect(s.templatesSeeded).toBeGreaterThan(0);
    expect(s.foreignKeys).toBeGreaterThan(10);
  });
});
