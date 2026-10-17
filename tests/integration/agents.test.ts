/**
 * Agent pipeline against a real Postgres database, with no AI model configured
 * (as in production). Documents are generated PDFs; their text is SYNTHETIC.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type postgres from "postgres";
import * as svc from "@/lib/server/activities";
import { runAgents } from "@/lib/server/agents";
import { makeUser, testSql } from "../helpers/db";

let sql: postgres.Sql;
let faculty: Awaited<ReturnType<typeof makeUser>>;

async function pdf(marker: string) {
  const d = await PDFDocument.create();
  d.setTitle(marker);
  d.addPage();
  return d.save();
}

const REPORT = `Activity Report
Session: 2030-31
Title of the Activity “Science Quiz”
Date of Activity 12/01/2031 Time: 10.00 am
No. of Students Involved: | Male: 2 Female: 1 Total: 3
Objectives Practise science basics.`;
const NOTICE = `Date:- 05/01/2031\n\nNOTICE\n\nStudents are informed that a “Science Quiz” will be held on 14th January 2031 at 10.00 am in Hall B.`;

beforeAll(async () => {
  sql = testSql();
  faculty = await makeUser(sql, "faculty");
});
afterAll(async () => sql.end());

describe("agents (no model configured)", () => {
  let id: string;
  let noticeSrc: string;

  it("shows missing documents, a wrong document type and the conflict, with sources", async () => {
    id = await svc.createActivity(sql, faculty, { fields: {} });
    const report = await svc.addSource(sql, faculty, id, { kind: "activity_report", filename: "report.pdf", bytes: await pdf("r") });
    await svc.saveExtraction(sql, faculty, report.id, { engine: "test", pages: [{ page: 1, method: "pdf_text", text: REPORT, confidence: null }] });
    // the notice is uploaded with the wrong type on purpose
    noticeSrc = (await svc.addSource(sql, faculty, id, { kind: "poster", filename: "notice.pdf", bytes: await pdf("n") })).id;
    await svc.saveExtraction(sql, faculty, noticeSrc, { engine: "test", pages: [{ page: 1, method: "pdf_text", text: NOTICE, confidence: null }] });

    const b = await svc.loadActivityBundle(sql, faculty, id);
    expect(b.agents.missing).toEqual(["notice", "attendance", "photo"]);
    expect(b.agents.intake.find((i) => i.sourceId === noticeSrc)).toMatchObject({ uploadedAs: "poster", suggested: "notice", method: "rules" });
    expect(b.agents.intake.find((i) => i.sourceId === report.id)).toMatchObject({ uploadedAs: "activity_report", suggested: "activity_report" });
    const date = b.agents.conflicts.find((c) => c.field === "activity_date")!;
    // read as a poster, the notice's issue date (05/01) is taken as an activity date too —
    // the reason the type check above matters
    expect(date.groups.map((g) => g.value).sort()).toEqual(["2031-01-05", "2031-01-12", "2031-01-14"]);
    expect(date.groups.find((g) => g.value === "2031-01-12")!.sources).toEqual([{ kind: "activity_report", page: 1 }]);
  });

  it("runs the pipeline: rule steps done, model steps skipped and audited", async () => {
    const run = await runAgents(sql, faculty, id, null);
    expect(run.model).toBeNull();
    expect(run.steps.map((s) => [s.agent, s.status])).toEqual([
      ["intake", "done"],
      ["extraction", "skipped"],
      ["validation", "done"],
      ["drafting", "skipped"],
    ]);
    expect(run.steps[0].summary).toMatch(/1 may be labelled with the wrong type/);
    expect(run.drafts).toEqual([]);
    const b = await svc.loadActivityBundle(sql, faculty, id);
    const log = b.audit.find((a) => a.action === "agents.run")!;
    expect(log.details).toMatchObject({ model: null });
    // the agents changed nothing: the date is still a conflict for the reviewer
    expect(b.state.fields.find((f) => f.field_key === "activity_date")!.status).toBe("conflicting");
  });
});
