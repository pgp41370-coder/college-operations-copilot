/** Pilot feedback and metrics against a real Postgres database (synthetic data). */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type postgres from "postgres";
import * as svc from "@/lib/server/activities";
import type { User } from "@/lib/server/auth-core";
import { getMyFeedback, listFeedback, pilotMetrics, submitFeedback } from "@/lib/server/feedback";
import { createUser } from "@/lib/server/users";
import { makeUser, testSql } from "../helpers/db";

let sql: postgres.Sql;
let owner: User;
let other: Awaited<ReturnType<typeof makeUser>>;
let admin: Awaited<ReturnType<typeof makeUser>>;
let draftId: string;
let approvedId: string;

const answer = { rating: 4, workedWell: "Provenance links", difficult: "Handwritten names", reportCorrections: "minor", manualEffort: "some", wouldUseAgain: "yes" };

/** A user on a non-test domain, so pilot metrics count them. */
async function realUser(): Promise<User> {
  const email = `pilot-${randomBytes(4).toString("hex")}@college.example`;
  const id = await createUser(sql, null, { email, name: "Pilot Faculty", role: "faculty", password: randomBytes(12).toString("base64url") });
  return { id, email, name: "Pilot Faculty", role: "faculty" };
}

beforeAll(async () => {
  sql = testSql();
  owner = await realUser();
  other = await makeUser(sql, "faculty");
  admin = await makeUser(sql, "admin");
  draftId = await svc.createActivity(sql, owner, { fields: { title: "Draft activity" } });
  approvedId = await svc.createActivity(sql, owner, { fields: { title: "Approved activity" } });
  // Approval itself is covered by workflow.test.ts; here only the state matters.
  await sql`update activities set status = 'APPROVED', approved_by = ${owner.id}, approved_at = now() where id = ${approvedId}`;
});
afterAll(async () => sql.end());

describe("pilot feedback", () => {
  it("is only accepted after approval", async () => {
    await expect(submitFeedback(sql, owner, draftId, answer)).rejects.toThrow(/once the activity has been approved/);
  });

  it("validates the answers", async () => {
    await expect(submitFeedback(sql, owner, approvedId, { ...answer, rating: 6 })).rejects.toThrow();
    await expect(submitFeedback(sql, owner, approvedId, { ...answer, reportCorrections: "some" })).rejects.toThrow();
    await expect(submitFeedback(sql, owner, approvedId, { ...answer, workedWell: "x".repeat(2001) })).rejects.toThrow();
  });

  it("another faculty member cannot give or read feedback on the activity", async () => {
    await expect(submitFeedback(sql, other, approvedId, answer)).rejects.toThrow(/not found/);
    await expect(getMyFeedback(sql, other, approvedId)).rejects.toThrow(/not found/);
  });

  it("stores one response per person, updates it, and audits without free text", async () => {
    const first = await submitFeedback(sql, owner, approvedId, answer);
    expect(first).toMatchObject({ rating: 4, report_corrections: "minor", worked_well: "Provenance links" });
    const second = await submitFeedback(sql, owner, approvedId, { ...answer, rating: 5, difficult: "" });
    expect(second.id).toBe(first.id);
    expect(second.rating).toBe(5);
    expect(second.difficult).toBeNull();
    expect((await getMyFeedback(sql, owner, approvedId))?.rating).toBe(5);
    const logs = await sql<{ action: string; details: Record<string, unknown> }[]>`
      select action, details from audit_logs where activity_id = ${approvedId} and action like 'feedback.%' order by id`;
    expect(logs.map((l) => l.action)).toEqual(["feedback.submitted", "feedback.updated"]);
    expect(JSON.stringify(logs)).not.toContain("Provenance links");
  });

  it("only administrators can see responses and metrics", async () => {
    await expect(pilotMetrics(sql, owner)).rejects.toThrow(/Administrator/);
    await expect(listFeedback(sql, owner)).rejects.toThrow(/Administrator/);
    const rows = await listFeedback(sql, admin);
    expect(rows.find((r) => r.activity_id === approvedId)?.worked_well).toBe("Provenance links");
  });

  it("metrics are counted from real usage and exclude test accounts", async () => {
    const before = await pilotMetrics(sql, admin);
    // Usage by a .invalid (test) account must not change the numbers.
    const testOwned = await svc.createActivity(sql, other, { fields: { title: "Test account activity" } });
    await sql`update activities set status = 'APPROVED', approved_by = ${other.id}, approved_at = now() where id = ${testOwned}`;
    await submitFeedback(sql, other, testOwned, { ...answer, rating: 1 });
    const after = await pilotMetrics(sql, admin);
    expect(after.activities.total).toBe(before.activities.total);
    expect(after.feedback.responses).toBe(before.feedback.responses);
    expect(after.feedback.averageRating).toBe(before.feedback.averageRating);

    expect(after.users.repeat).toBeGreaterThanOrEqual(1); // owner has two activities
    expect(after.feedback.corrections.minor).toBeGreaterThanOrEqual(1);
    expect(after.feedback.wouldUseAgain.yes).toBeGreaterThanOrEqual(1);
  });
});
