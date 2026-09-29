import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type postgres from "postgres";
import * as svc from "@/lib/server/activities";
import { createSession, userForToken, verifyCredentials, destroySession } from "@/lib/server/auth-core";
import { rateLimit } from "@/lib/server/rate-limit";
import { createUser, updateUser } from "@/lib/server/users";
import { saveTemplateVersion } from "@/lib/server/templates";
import { makeUser, testSql } from "../helpers/db";

let sql: postgres.Sql;
let alice: Awaited<ReturnType<typeof makeUser>>;
let bob: Awaited<ReturnType<typeof makeUser>>;
let admin: Awaited<ReturnType<typeof makeUser>>;
let aliceActivity: string;
let aliceSource: string;

beforeAll(async () => {
  sql = testSql();
  alice = await makeUser(sql, "faculty");
  bob = await makeUser(sql, "faculty");
  admin = await makeUser(sql, "admin");
  aliceActivity = await svc.createActivity(sql, alice, { fields: { title: "Private activity" } });
  const d = await PDFDocument.create();
  d.addPage();
  aliceSource = (await svc.addSource(sql, alice, aliceActivity, { kind: "notice", filename: "n.pdf", bytes: await d.save() })).id;
});
afterAll(async () => sql.end());

describe("authorization", () => {
  it("another faculty member cannot read or modify the activity", async () => {
    await expect(svc.getActivity(sql, bob, aliceActivity)).rejects.toThrow(/not found/);
    await expect(svc.loadActivityBundle(sql, bob, aliceActivity)).rejects.toThrow(/not found/);
    await expect(svc.setField(sql, bob, aliceActivity, "title", { value: "hijack" })).rejects.toThrow(/not found/);
    await expect(svc.approveActivity(sql, bob, aliceActivity)).rejects.toThrow(/not found/);
    await expect(svc.generateReports(sql, bob, aliceActivity)).rejects.toThrow(/not found/);
  });
  it("another faculty member cannot download or delete the source file", async () => {
    await expect(svc.getSourceBytes(sql, bob, aliceSource)).rejects.toThrow(/not found/);
    await expect(svc.deleteSource(sql, bob, aliceSource)).rejects.toThrow(/not found/);
    await expect(svc.saveExtraction(sql, bob, aliceSource, { engine: "x", pages: [{ page: 1, method: "ocr", text: "x", confidence: 1 }] })).rejects.toThrow(/not found/);
  });
  it("lists only own activities for faculty; admins see all", async () => {
    expect((await svc.listActivities(sql, bob)).map((a) => a.id)).not.toContain(aliceActivity);
    expect((await svc.listActivities(sql, alice)).map((a) => a.id)).toContain(aliceActivity);
    expect((await svc.listActivities(sql, admin)).map((a) => a.id)).toContain(aliceActivity);
    expect((await svc.getSourceBytes(sql, admin, aliceSource)).data.length).toBeGreaterThan(0);
  });
  it("malformed ids are rejected as not found", async () => {
    await expect(svc.getActivity(sql, alice, "'; drop table users; --")).rejects.toThrow(/not found/);
  });
  it("only admins can reopen, manage users or edit templates", async () => {
    await expect(svc.reopenActivity(sql, alice, aliceActivity, "reason here")).rejects.toThrow(/administrator/i);
    await expect(createUser(sql, alice, { email: "x@test.invalid", name: "X", role: "admin", password: "long-password-1" })).rejects.toThrow(/Administrator/);
    await expect(updateUser(sql, alice, bob.id, { isActive: false })).rejects.toThrow(/Administrator/);
    const [t] = await sql<{ id: string }[]>`select id from templates limit 1`;
    await expect(saveTemplateVersion(sql, alice, t.id, {})).rejects.toThrow(/Administrator/);
  });
  it("admin template edits are validated", async () => {
    const [t] = await sql<{ id: string }[]>`select id from templates limit 1`;
    await expect(saveTemplateVersion(sql, admin, t.id, { nope: true })).rejects.toThrow(/invalid/);
  });
});

describe("authentication", () => {
  it("verifies passwords and rejects wrong ones", async () => {
    expect(await verifyCredentials(sql, alice.email, alice.password)).toMatchObject({ id: alice.id });
    expect(await verifyCredentials(sql, alice.email.toUpperCase(), alice.password)).toMatchObject({ id: alice.id });
    expect(await verifyCredentials(sql, alice.email, "wrong-password")).toBeNull();
    expect(await verifyCredentials(sql, "nobody@test.invalid", "whatever")).toBeNull();
  });
  it("sessions are stored hashed and can be revoked", async () => {
    const { token } = await createSession(sql, alice.id);
    const [raw] = await sql`select 1 from sessions where token_hash = ${token}`;
    expect(raw).toBeUndefined();
    expect((await userForToken(sql, token))?.id).toBe(alice.id);
    await destroySession(sql, token);
    expect(await userForToken(sql, token)).toBeNull();
    expect(await userForToken(sql, "garbage")).toBeNull();
  });
  it("deactivated users cannot sign in and lose sessions", async () => {
    const carol = await makeUser(sql, "faculty");
    const { token } = await createSession(sql, carol.id);
    await updateUser(sql, admin, carol.id, { isActive: false });
    expect(await userForToken(sql, token)).toBeNull();
    expect(await verifyCredentials(sql, carol.email, carol.password)).toBeNull();
  });
  it("weak passwords are rejected", async () => {
    await expect(createUser(sql, admin, { email: "weak@test.invalid", name: "Weak", role: "faculty", password: "short" })).rejects.toThrow(/at least 10/);
  });
  it("rate limiting blocks repeated attempts", async () => {
    for (let i = 0; i < 3; i++) await rateLimit(sql, "test", "k1", 3, 60);
    await expect(rateLimit(sql, "test", "k1", 3, 60)).rejects.toThrow(/Too many/);
  });
});
