/**
 * Reference-case fixtures: the two KDK activity packets in reference-data/.
 * These files are private and git-ignored; tests that use them are skipped
 * when the files (or the local OCR tools) are not present.
 *
 * Each packet is a single compiled PDF. The page -> document-kind mapping
 * below was read by a person from the packets themselves.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { extractLocal, toolsAvailable } from "./node-ocr";
import type { PageText } from "../../src/lib/extraction/types";
import type { SourceKind } from "../../src/lib/templates/schema";

export interface ReferencePacket {
  id: string;
  file: string;
  pages: Record<number, SourceKind | null>;
  /** True for packets never used while writing rules or prompts (from reference-data/held-out.json). */
  heldOut?: boolean;
  /** Field values a person read from the packet (see docs/HELD_OUT_PACKETS.md for the format). */
  answers?: Record<string, { equals: string } | { includes: string } | { missing: true } | { date: string; conflictWith: string }>;
}

export const REFERENCE_DIR = path.join(process.cwd(), "reference-data");

export const PACKETS: ReferencePacket[] = [
  {
    id: "essay",
    file: "Essay Writing on Rashtriya Ekta Divas.pdf",
    pages: { 1: "poster", 2: "notice", 3: "activity_report", 4: "detailed_report", 5: "attendance", 6: "attendance", 7: "photo", 8: "photo", 9: "supporting", 10: "supporting", 11: "supporting" },
  },
  {
    id: "oath",
    file: "Rashtriya Ekta Divas_Oath.pdf",
    pages: { 1: "poster", 2: "notice", 3: "activity_report", 4: "detailed_report", 5: "attendance", 6: "attendance", 7: "photo", 8: null },
  },
];

/**
 * Held-out packets listed by a person in reference-data/held-out.json (git-ignored).
 * Format and labelling instructions: docs/HELD_OUT_PACKETS.md.
 */
export function heldOutPackets(): ReferencePacket[] {
  const file = path.join(REFERENCE_DIR, "held-out.json");
  if (!existsSync(file)) return [];
  const list = JSON.parse(readFileSync(file, "utf8")) as ReferencePacket[];
  return list.filter((p) => existsSync(path.join(REFERENCE_DIR, p.file))).map((p) => ({ ...p, heldOut: true }));
}

/** The two original packets plus any held-out packets. */
export function allPackets(): ReferencePacket[] {
  return [...PACKETS, ...heldOutPackets()];
}

export function referenceAvailable(): boolean {
  return toolsAvailable() && PACKETS.every((p) => existsSync(path.join(REFERENCE_DIR, p.file)));
}

/** Page texts for a packet, each page tagged with its document kind. */
export function packetPages(packet: ReferencePacket): PageText[] {
  const pages = extractLocal(path.join(REFERENCE_DIR, packet.file));
  return pages
    .filter((p) => packet.pages[p.page])
    .map((p) => ({
      sourceId: `${packet.id}:${packet.pages[p.page]}`,
      kind: packet.pages[p.page]!,
      filename: packet.file,
      page: p.page,
      text: p.text,
      method: p.method,
      confidence: p.confidence,
    }));
}

export interface PacketDocument {
  kind: SourceKind;
  filename: string;
  bytes: Uint8Array;
  /** Page numbers in the original packet, in order. */
  originalPages: number[];
  /** Extracted text for each page of this document (page numbers renumbered from 1). */
  pages: { page: number; text: string; method: "pdf_text" | "ocr"; confidence: number | null; engine: string }[];
}

/**
 * Splits a compiled packet into one PDF per document kind (in memory only),
 * so each can be uploaded with its own kind — the way faculty upload them.
 */
export async function splitPacket(packet: ReferencePacket): Promise<PacketDocument[]> {
  const { PDFDocument } = await import("pdf-lib");
  const { readFileSync } = await import("node:fs");
  const filePath = path.join(REFERENCE_DIR, packet.file);
  const src = await PDFDocument.load(readFileSync(filePath));
  const extracted = extractLocal(filePath);
  const byKind = new Map<SourceKind, number[]>();
  for (const [p, kind] of Object.entries(packet.pages)) {
    if (!kind) continue;
    byKind.set(kind, [...(byKind.get(kind) ?? []), Number(p)]);
  }
  const docs: PacketDocument[] = [];
  for (const [kind, pages] of byKind) {
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, pages.map((p) => p - 1));
    copied.forEach((pg) => out.addPage(pg));
    docs.push({
      kind,
      filename: `${packet.id}-${kind}.pdf`,
      bytes: await out.save(),
      originalPages: pages,
      pages: pages.map((p, i) => {
        const e = extracted.find((x) => x.page === p)!;
        return { page: i + 1, text: e.text, method: e.method, confidence: e.confidence, engine: e.engine };
      }),
    });
  }
  return docs;
}
