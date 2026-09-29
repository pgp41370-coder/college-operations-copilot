/**
 * LOCAL ONLY. Loads the two KDK reference packets from reference-data/ into a
 * database as pilot activities owned by an existing user, using the same
 * service code as the web app. Text is extracted locally with Tesseract CLI.
 *
 *   DATABASE_URL=... npx tsx scripts/load-pilot-fixtures.ts --owner you@college.edu
 *
 * These are real institutional documents containing student names and
 * signatures. Do not load them into a publicly accessible deployment unless
 * the institution has authorised it.
 */
import postgres from "postgres";
import * as svc from "../src/lib/server/activities";
import { PACKETS, referenceAvailable, splitPacket } from "./lib/reference-packets";

async function main() {
  const url = process.env.DATABASE_URL;
  const i = process.argv.indexOf("--owner");
  const owner = i > 0 ? process.argv[i + 1] : undefined;
  if (!url || !owner) {
    console.error("Usage: DATABASE_URL=... npx tsx scripts/load-pilot-fixtures.ts --owner <email>");
    process.exit(1);
  }
  if (!referenceAvailable()) {
    console.error("reference-data/ files or local OCR tools (tesseract, poppler) not found.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 2, prepare: false, onnotice: () => {} });
  try {
    const [user] = await sql<{ id: string; email: string; name: string; role: "faculty" | "admin" }[]>`
      select id, email, name, role from users where lower(email) = lower(${owner}) and is_active`;
    if (!user) throw new Error(`No active user ${owner}. Create one with scripts/create-user.ts first.`);
    for (const packet of PACKETS) {
      const id = await svc.createActivity(sql, user, { fields: {} });
      for (const doc of await splitPacket(packet)) {
        const s = await svc.addSource(sql, user, id, { kind: doc.kind, filename: doc.filename, bytes: doc.bytes, sourceInfo: `Pages ${doc.originalPages.join(", ")} of ${packet.file}` });
        if (doc.kind !== "photo") {
          await svc.saveExtraction(sql, user, s.id, {
            engine: doc.pages[0].engine,
            pages: doc.pages.map((p) => ({ page: p.page, method: p.method, text: p.text, confidence: p.confidence })),
          });
        }
      }
      console.log(`Loaded pilot activity ${packet.id}: ${id}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
