/**
 * Local (developer machine) text extraction used by tests and the pilot
 * fixture loader. Mirrors the browser pipeline: use the PDF text layer when a
 * page has one, otherwise OCR the rendered page with Tesseract (PSM 4).
 *
 * Requires poppler (pdftotext, pdftoppm, pdfinfo) and tesseract on PATH.
 * Results are cached in .cache/ocr (git-ignored).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

export interface LocalPage {
  page: number;
  text: string;
  method: "pdf_text" | "ocr";
  engine: string;
  confidence: number | null;
}

export function toolsAvailable(): boolean {
  try {
    execFileSync("tesseract", ["--version"], { stdio: "ignore" });
    execFileSync("pdftoppm", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function tesseractVersion(): string {
  const out = execFileSync("tesseract", ["--version"], { encoding: "utf8" });
  return out.split("\n")[0].trim();
}

function ocrImage(imagePath: string): { text: string; confidence: number } {
  const base = path.join(os.tmpdir(), `coc-ocr-${process.pid}-${Date.now()}`);
  execFileSync("tesseract", [imagePath, base, "--psm", "4", "txt", "tsv"], { stdio: "ignore" });
  const text = readFileSync(`${base}.txt`, "utf8");
  const tsv = readFileSync(`${base}.tsv`, "utf8").split("\n").slice(1);
  const confs = tsv
    .map((l) => l.split("\t"))
    .filter((c) => c.length >= 12 && c[11].trim() && Number(c[10]) >= 0)
    .map((c) => Number(c[10]));
  rmSync(`${base}.txt`, { force: true });
  rmSync(`${base}.tsv`, { force: true });
  const confidence = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
  return { text, confidence: Math.round(confidence * 100) / 100 };
}

export function extractLocal(filePath: string): LocalPage[] {
  const bytes = readFileSync(filePath);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const cacheDir = path.join(process.cwd(), ".cache", "ocr");
  const cacheFile = path.join(cacheDir, `${hash}.json`);
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));
  mkdirSync(cacheDir, { recursive: true });

  const engine = `${tesseractVersion()} (CLI, psm 4)`;
  const pages: LocalPage[] = [];
  const isPdf = bytes.subarray(0, 4).toString() === "%PDF";
  if (!isPdf) {
    const r = ocrImage(filePath);
    pages.push({ page: 1, text: r.text, method: "ocr", engine, confidence: r.confidence });
  } else {
    const info = execFileSync("pdfinfo", [filePath], { encoding: "utf8" });
    const count = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 0);
    const tmp = path.join(os.tmpdir(), `coc-pages-${process.pid}-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    for (let p = 1; p <= count; p++) {
      const layer = execFileSync("pdftotext", ["-f", String(p), "-l", String(p), "-layout", filePath, "-"], {
        encoding: "utf8",
      });
      if (layer.replace(/\s/g, "").length >= 200) {
        pages.push({ page: p, text: layer, method: "pdf_text", engine: "poppler pdftotext", confidence: null });
        continue;
      }
      const prefix = path.join(tmp, `p${p}`);
      execFileSync("pdftoppm", ["-r", "200", "-f", String(p), "-l", String(p), "-png", "-singlefile", filePath, prefix]);
      const r = ocrImage(`${prefix}.png`);
      pages.push({ page: p, text: r.text, method: "ocr", engine, confidence: r.confidence });
    }
    rmSync(tmp, { recursive: true, force: true });
  }
  writeFileSync(cacheFile, JSON.stringify(pages));
  return pages;
}
