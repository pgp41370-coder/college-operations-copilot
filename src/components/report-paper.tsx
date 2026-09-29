import type { ActivityReportContent, AttendanceSummaryContent, DetailedReportContent } from "@/lib/reports/build";

/** Highlights "Not provided" so gaps are obvious on screen (not in exports). */
function Marked({ text }: { text: string }) {
  const parts = text.split(/(Not provided\.?|\[[^\]]+ not provided\])/g);
  return (
    <>
      {parts.map((p, i) => (/not provided/i.test(p) ? <span key={i} className="missing-mark">{p}</span> : <span key={i}>{p}</span>))}
    </>
  );
}

function Paras({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="mb-3 text-justify whitespace-pre-wrap"><Marked text={p} /></p>
      ))}
    </>
  );
}

export function ActivityReportPaper({ c }: { c: ActivityReportContent }) {
  return (
    <div className="paper">
      <div className="text-center font-bold">{c.titleLines.map((l, i) => <div key={i}><Marked text={l} /></div>)}</div>
      <div className="my-4 text-center font-bold">{c.heading}</div>
      <table>
        <tbody>
          {c.detailRows.map((r) => (
            <tr key={r.label}><td className="w-[32%]">{r.label}</td><td className="whitespace-pre-wrap"><Marked text={r.text} /></td></tr>
          ))}
        </tbody>
      </table>
      <table className="mt-5">
        <tbody>
          {c.narrativeRows.map((r) => (
            <tr key={r.label}><td className="w-[25%] font-bold">{r.label}</td><td className="whitespace-pre-wrap text-justify"><Marked text={r.text} /></td></tr>
          ))}
        </tbody>
      </table>
      <table className="mt-5">
        <tbody>
          <tr>{c.signatories.map((s) => <th key={s.heading} className="text-center">{s.heading}</th>)}</tr>
          <tr>
            {c.signatories.map((s) => (
              <td key={s.heading} className="h-36 align-bottom text-sm">
                <div className="mb-4 text-center text-xs text-slate-400">(signature)</div>
                {s.lines.map((l, i) => <div key={i} className={i === s.lines.length - 1 ? "font-bold" : ""}>{l}</div>)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function DetailedReportPaper({ c }: { c: DetailedReportContent }) {
  return (
    <div className="paper">
      <div className="border-b-2 border-black pb-2 text-center">
        {c.letterheadLines.map((l, i) => (
          <div key={i} className={i === 0 ? "text-lg font-bold" : i === 1 ? "font-bold" : "text-sm"}>{l}</div>
        ))}
      </div>
      <div className="mt-2 text-right"><Marked text={c.dateLine} /></div>
      <div className="my-2 text-center font-bold">{c.heading}</div>
      <p className="mb-3"><strong>{c.topicLabel}</strong> <Marked text={c.topic} /></p>
      <Paras text={c.description} />
      <p className="font-bold underline">{c.impactHeading}</p>
      <Paras text={c.impact} />
      <div className="mt-16 grid grid-cols-2 gap-8">
        {c.signatories.map((s, i) => (
          <div key={i} className={i === 1 ? "text-right" : ""}>
            <div className="mb-2 text-xs text-slate-400">(signature)</div>
            {s.lines.map((l, j) => <div key={j}>{l}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AttendanceSummaryPaper({ c }: { c: AttendanceSummaryContent }) {
  const r = c.reconciliation;
  const n = (v: number | null) => (v == null ? "Not provided" : String(v));
  return (
    <div className="paper">
      <div className="text-center text-lg font-bold">{c.heading}</div>
      <p>Activity: <Marked text={c.title} /></p>
      <p className="mb-3">Date of activity: <Marked text={c.activityDate} /></p>
      <table>
        <tbody>
          <tr><th></th><th>Stated in report</th><th>Attendance rows</th></tr>
          <tr><td>Total participants</td><td><Marked text={n(r.stated.total)} /></td><td>{r.attendance.rows}</td></tr>
          <tr><td>Male</td><td><Marked text={n(r.stated.male)} /></td><td>{r.attendance.male}</td></tr>
          <tr><td>Female</td><td><Marked text={n(r.stated.female)} /></td><td>{r.attendance.female}</td></tr>
          <tr><td>Gender not specified</td><td>—</td><td>{r.attendance.unspecified}</td></tr>
          <tr><td>Rows verified by reviewer</td><td>—</td><td>{r.attendance.verifiedRows} of {r.attendance.rows}</td></tr>
        </tbody>
      </table>
      <p className="mt-3 font-bold">Reconciliation: {r.overall.replace("_", " ")}</p>
      <ul className="list-disc pl-6 text-sm">
        {r.checks.map((ch) => <li key={ch.id}>{ch.label}: {ch.result.replace("_", " ")} — {ch.detail}</li>)}
      </ul>
      {r.messages.map((m, i) => <p key={i} className="text-sm">! {m}</p>)}
      {c.acknowledgement && <p className="mt-2 text-sm">Mismatch acknowledged by {c.acknowledgement.by} ({c.acknowledgement.at.slice(0, 10)}): {c.acknowledgement.note}</p>}
      <p className="mt-2 text-sm">Source documents: {c.sources.join(", ") || "None recorded"}</p>
      <p className="mt-1 text-xs">Gender is recorded only where written on the attendance sheet; it is never inferred from names.</p>
    </div>
  );
}
