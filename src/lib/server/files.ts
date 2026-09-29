import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { AppError } from "./errors";

/**
 * Vercel serverless functions accept request bodies up to 4.5 MB, so uploads
 * are capped below that. See LIMITATIONS.md.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_SOURCES_PER_ACTIVITY = 40;

export type AllowedMime = "application/pdf" | "image/jpeg" | "image/png";

const EXTENSIONS: Record<AllowedMime, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

/** Content sniffing — the declared type and extension are not trusted. */
export function sniffMime(bytes: Uint8Array): AllowedMime | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-") return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  return null;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]+/g, "_").trim().slice(0, 180);
  return cleaned || "file";
}

export interface ValidatedUpload {
  mime: AllowedMime;
  filename: string;
  sha256: string;
  pageCount: number | null;
}

export async function validateUpload(filename: string, bytes: Uint8Array): Promise<ValidatedUpload> {
  if (bytes.length === 0) throw new AppError(400, "The file is empty.");
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new AppError(413, `The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Please upload a smaller scan.`);
  }
  const mime = sniffMime(bytes);
  if (!mime) throw new AppError(415, "Unsupported file type. Upload a PDF, JPG, JPEG or PNG file.");
  const clean = sanitizeFilename(filename);
  const ext = clean.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if (!EXTENSIONS[mime].includes(ext)) {
    throw new AppError(415, `The file content (${mime}) does not match its extension "${ext || "none"}".`);
  }
  let pageCount: number | null = null;
  if (mime === "application/pdf") {
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      pageCount = doc.getPageCount();
    } catch {
      throw new AppError(422, "This PDF could not be read. It may be corrupt or incomplete.");
    }
    if (pageCount < 1) throw new AppError(422, "This PDF has no pages.");
  } else if (mime === "image/png") {
    const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 16))).toString("latin1");
    if (!tail.includes("IEND")) throw new AppError(422, "This PNG image appears to be incomplete.");
  }
  return { mime, filename: clean, sha256: createHash("sha256").update(bytes).digest("hex"), pageCount };
}
