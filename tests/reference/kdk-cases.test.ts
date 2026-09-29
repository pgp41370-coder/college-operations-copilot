/**
 * Reference-case validation using the two real KDK activity packets
 * (git-ignored, local only). Skipped automatically when the files or the
 * local OCR tools are unavailable.
 *
 * Expected values below were read by a person directly from the printed
 * activity reports in the packets — they are what the documents say, not
 * corrected values (e.g. "Resposibility" is spelled as printed).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type postgres from "postgres";
import * as svc from "@/lib/server/activities";
import { PACKETS, referenceAvailable, splitPacket } from "../../scripts/lib/reference-packets";
import { makeUser, testSql } from "../helpers/db";

const available = referenceAvailable();

interface Expected {
  counts: [string, string, string];
  titleIncludes: string;
  noticeDate: string;
}
const EXPECTED: Record<string, Expected> = {
  essay: { counts: ["39", "7", "46"], titleIncludes: "Essay Writing", noticeDate: "2024-10-28" },
  oath: { counts: ["38", "7", "45"], titleIncludes: "Oath", noticeDate: "2024-11-05" },
};

let sql: postgres.Sql;
let user: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  sql = testSql();
  user = await makeUser(sql, "faculty");
});
afterAll(async () => sql?.end());

describe.skipIf(!available)("KDK reference cases (same engine, same template)", () => {
  const ids: Record<string, string> = {};

  for (const packet of PACKETS) {
    describe(packet.id, () => {
      const exp = EXPECTED[packet.id];

      it("ingests the packet documents and extracts metadata with provenance", async () => {
        const id = await svc.createActivity(sql, user, { fields: {} });
        ids[packet.id] = id;
        for (const doc of await splitPacket(packet)) {
          const s = await svc.addSource(sql, user, id, { kind: doc.kind, filename: doc.filename, bytes: doc.bytes });
          if (doc.kind === "photo") continue;
          await svc.saveExtraction(sql, user, s.id, {
            engine: doc.pages[0].engine,
            pages: doc.pages.map((p) => ({ page: p.page, method: p.method, text: p.text, confidence: p.confidence })),
          });
        }
        const b = await svc.loadActivityBundle(sql, user, id);
        const f = (k: string) => b.state.fields.find((x) => x.field_key === k)!;
        const kindOf = (sourceId: string | null) => b.sources.find((s) => s.id === sourceId)?.kind;

        expect(f("session").value).toBe("2024-25");
        expect(f("category").value).toBe("Social Resposibility");
        expect(f("title").value).toContain(exp.titleIncludes);
        expect(f("association").value).toBe("Institution Innovation Council");
        expect([f("male_count").value, f("female_count").value, f("total_count").value]).toEqual(exp.counts);
        expect(f("activity_time").value).toBe("13:30");
        expect(f("notice_date").value).toBe(exp.noticeDate);
        for (const k of ["category", "total_count", "brief", "objectives", "outcomes"]) {
          expect(kindOf(f(k).source_id)).toBe("activity_report");
          expect(f(k).source_page).toBe(1);
          expect(f(k).status).toBe("extracted");
        }
        // The printed reports show only dashes for the speaker: nothing is invented.
        expect(f("invited_speaker")).toMatchObject({ status: "missing", value: null });
      });

      it("keeps the poster date conflict for human review", async () => {
        const b = await svc.loadActivityBundle(sql, user, ids[packet.id]);
        const date = b.state.fields.find((x) => x.field_key === "activity_date")!;
        expect(date).toMatchObject({ status: "conflicting", value: null });
        const byKind = new Map<string, Set<string>>();
        for (const c of b.candidates.filter((x) => x.fieldKey === "activity_date")) {
          byKind.set(c.sourceKind, (byKind.get(c.sourceKind) ?? new Set()).add(c.value));
        }
        expect([...byKind.get("poster")!]).toEqual(["2024-10-31"]);
        for (const k of ["activity_report", "detailed_report", "notice"]) expect([...byKind.get(k)!]).toEqual(["2024-11-06"]);
        // The notice header date is the issue date, never an activity-date candidate.
        const dateValues = b.candidates.filter((c) => c.fieldKey === "activity_date").map((c) => c.value);
        if (exp.noticeDate !== "2024-11-06") expect(dateValues).not.toContain(exp.noticeDate);
      });

      it("drafts attendance rows from handwriting only as unverified OCR", async () => {
        const b = await svc.loadActivityBundle(sql, user, ids[packet.id]);
        expect(b.attendance.length).toBeGreaterThan(10);
        expect(b.attendance.every((r) => r.method === "ocr" && !r.verified)).toBe(true);
        expect(b.attendance.every((r) => r.issues.some((i) => i.startsWith("OCR draft")))).toBe(true);
        expect(b.state.reconciliation.overall).not.toBe("PASS");
        // Stated counts are internally consistent (male + female = total).
        expect(b.state.reconciliation.checks.find((c) => c.id === "stated_sum")!.result).toBe("PASS");
      });

      it("generates both reports from the same engine and blocks approval until reviewed", async () => {
        const id = ids[packet.id];
        await svc.generateReports(sql, user, id);
        const reports = await svc.latestReports(sql, id);
        expect(reports.map((r) => r.report_type).sort()).toEqual(["activity_report", "attendance_summary", "detailed_report"]);
        const ar = reports.find((r) => r.report_type === "activity_report")!.content as { detailRows: { label: string; text: string }[] };
        expect(ar.detailRows.find((r) => r.label.startsWith("No. of Students"))!.text).toBe(
          `Male: ${exp.counts[0]}    Female: ${exp.counts[1]}    Total: ${exp.counts[2]}`,
        );
        // The conflicting date is not printed as a fact.
        expect(ar.detailRows.find((r) => r.label === "Date of Activity")!.text).toMatch(/^Not provided/);
        await expect(svc.approveActivity(sql, user, id)).rejects.toThrow(/cannot be approved/);
      });

      it("resolves the date only when the reviewer chooses a candidate", async () => {
        const id = ids[packet.id];
        const b = await svc.loadActivityBundle(sql, user, id);
        const c = b.candidates.find((x) => x.fieldKey === "activity_date" && x.sourceKind === "activity_report")!;
        await svc.chooseCandidate(sql, user, id, "activity_date", c.id);
        await svc.generateReports(sql, user, id);
        const ar = (await svc.latestReports(sql, id)).find((r) => r.report_type === "activity_report")!.content as { detailRows: { label: string; text: string }[] };
        expect(ar.detailRows.find((r) => r.label === "Date of Activity")!.text).toBe("06/11/2024  Time: 01.30 pm");
        const after = await svc.loadActivityBundle(sql, user, id);
        expect(after.audit.map((a) => a.action)).toContain("field.conflict_resolved");
      });
    });
  }

  it("uses one template for both event types", async () => {
    const rows = await sql`select distinct template_id from activities where id in ${sql(Object.values(ids))}`;
    expect(rows).toHaveLength(1);
  });
});

describe("no event-specific business logic", () => {
  it("application source never hard-codes the reference event names", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(n)) files.push(p);
      }
    };
    walk(path.join(process.cwd(), "src"));
    for (const f of files) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/Essay Writing|Oath Ceremony|Rashtriya Ekta/i);
    }
  });
});
