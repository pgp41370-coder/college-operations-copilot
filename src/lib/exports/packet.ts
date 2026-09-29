"use client";
/**
 * Compiled activity packet (single PDF) and evidence package (ZIP), assembled
 * in the browser from the app's authenticated endpoints. Built client-side so
 * large packets are not limited by serverless response-size limits.
 * Original source files are copied unmodified.
 */
import { PDFDocument } from "pdf-lib";
import type { TemplateDefinition } from "../templates/schema";
import { addImagePage, sectionPagePdf } from "./pdf";

export interface PacketSource {
  id: string;
  kind: string;
  filename: string;
  mime_type: string;
  caption: string | null;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Download failed (${res.status}).`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function appendPdf(out: PDFDocument, bytes: Uint8Array) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = await out.copyPages(src, src.getPageIndices());
  pages.forEach((p) => out.addPage(p));
}

export async function buildPacketPdf(
  activityId: string,
  def: TemplateDefinition,
  sources: PacketSource[],
  onProgress: (msg: string) => void,
): Promise<{ bytes: Uint8Array; skipped: string[] }> {
  const out = await PDFDocument.create();
  const skipped: string[] = [];
  for (const section of def.packet.sections) {
    if (section.include === "generated_activity_report" || section.include === "generated_detailed_report") {
      const type = section.include.replace("generated_", "");
      onProgress(`Adding ${type.replace("_", " ")}`);
      await appendPdf(out, await fetchBytes(`/api/activities/${activityId}/export?type=${type}&format=pdf`));
      continue;
    }
    const list = sources.filter((s) => s.kind === section.include);
    if (!list.length) continue;
    if (section.heading && section.include !== "photo") await appendPdf(out, await sectionPagePdf(section.heading));
    for (const s of list) {
      onProgress(`Adding ${s.filename}`);
      try {
        const bytes = await fetchBytes(`/api/sources/${s.id}/file`);
        if (s.mime_type === "application/pdf") await appendPdf(out, bytes);
        else await addImagePage(out, bytes, s.mime_type, s.caption, section.include === "photo" ? section.heading : undefined);
      } catch (e) {
        skipped.push(`${s.filename}: ${e instanceof Error ? e.message : "could not be added"}`);
      }
    }
  }
  if (skipped.length) {
    await appendPdf(out, await sectionPagePdf("Files not included", skipped));
  }
  out.setTitle("Activity packet");
  out.setProducer("College Operations Copilot");
  return { bytes: await out.save(), skipped };
}

export async function buildEvidenceZip(activityId: string, sources: PacketSource[], onProgress: (msg: string) => void): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const exp = (type: string, format: string) => fetchBytes(`/api/activities/${activityId}/export?type=${type}&format=${format}`);
  onProgress("Adding provenance manifest");
  zip.file("manifest.json", await exp("manifest", "json"));
  for (const [type, formats] of [["activity_report", ["pdf", "docx"]], ["detailed_report", ["pdf", "docx"]], ["attendance_summary", ["pdf"]]] as const) {
    for (const f of formats) {
      onProgress(`Adding ${type} (${f})`);
      zip.file(`reports/${type}.${f}`, await exp(type, f));
    }
  }
  zip.file("attendance/attendance.csv", await exp("attendance_csv", "csv"));
  const used = new Set<string>();
  for (const s of sources) {
    onProgress(`Adding original ${s.filename}`);
    let name = `originals/${s.kind}/${s.filename}`;
    for (let i = 2; used.has(name); i++) name = `originals/${s.kind}/${i}-${s.filename}`;
    used.add(name);
    zip.file(name, await fetchBytes(`/api/sources/${s.id}/file`));
  }
  return zip.generateAsync({ type: "blob" });
}

export function saveBlob(data: Blob | Uint8Array, filename: string, type = "application/pdf") {
  const blob = data instanceof Blob ? data : new Blob([data.slice().buffer], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
