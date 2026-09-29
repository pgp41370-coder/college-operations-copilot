import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { MAX_UPLOAD_BYTES, sanitizeFilename, sniffMime, validateUpload } from "@/lib/server/files";

async function tinyPdf() {
  const d = await PDFDocument.create();
  d.addPage();
  return d.save();
}

describe("upload validation", () => {
  it("accepts a valid PDF and counts pages", async () => {
    const v = await validateUpload("notice.pdf", await tinyPdf());
    expect(v.mime).toBe("application/pdf");
    expect(v.pageCount).toBe(1);
    expect(v.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("rejects an empty file", async () => {
    await expect(validateUpload("a.pdf", new Uint8Array())).rejects.toThrow(/empty/);
  });
  it("rejects an oversized file", async () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    await expect(validateUpload("a.pdf", big)).rejects.toThrow(/larger than/);
  });
  it("rejects an invalid file type by content, not by name", async () => {
    await expect(validateUpload("fake.pdf", new TextEncoder().encode("hello world"))).rejects.toThrow(/Unsupported file type/);
    await expect(validateUpload("script.exe", new Uint8Array([0x4d, 0x5a, 0, 0]))).rejects.toThrow(/Unsupported/);
  });
  it("rejects a corrupt PDF", async () => {
    const corrupt = new TextEncoder().encode("%PDF-1.7\n this is not really a pdf");
    await expect(validateUpload("broken.pdf", corrupt)).rejects.toThrow(/could not be read/);
  });
  it("rejects content/extension mismatch", async () => {
    await expect(validateUpload("photo.png", await tinyPdf())).rejects.toThrow(/does not match/);
  });
  it("sniffs JPEG and PNG", () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
  });
  it("strips paths and control characters from filenames", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("a<b>.pdf")).toBe("a_b_.pdf");
  });
});
