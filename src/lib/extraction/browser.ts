"use client";
/**
 * In-browser text extraction. Runs on the reviewer's machine, so no document
 * content is sent to a third-party OCR service and there is no server cost.
 *
 *  - PDFs: the embedded text layer is used when a page has one (method
 *    "pdf_text"); otherwise the page is rendered and OCR'd (method "ocr").
 *  - Images: OCR.
 *
 * OCR uses tesseract.js (Tesseract LSTM, English). The OCR engine and English
 * language data are downloaded by the browser from the jsDelivr CDN on first
 * use; the documents themselves never leave the browser for OCR.
 */

import { wordsToText, type OcrWord } from "./layout";

export interface BrowserPage {
  page: number;
  method: "pdf_text" | "ocr" | "none";
  text: string;
  confidence: number | null;
}

export type Progress = (message: string, fraction: number) => void;

const MIN_TEXT_LAYER_CHARS = 200;
export const OCR_RENDER_WIDTH = 1224;
const TESSERACT_VERSION = "7.0.0";
const PDFJS_VERSION = "6.3.289";

type TesseractWorker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

async function ocrWorker(onProgress: Progress, label: () => string): Promise<TesseractWorker> {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") onProgress(`${label()} — reading text`, m.progress);
      else if (m.status.includes("loading")) onProgress(`Loading OCR engine (first use may take a minute)`, m.progress);
    },
  });
  // PSM 4: a single column of text of variable sizes — suits form-like reports.
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });
  return worker;
}

export async function extractInBrowser(file: Blob, mime: string, onProgress: Progress): Promise<{ engine: string; pages: BrowserPage[] }> {
  let worker: TesseractWorker | null = null;
  let current = "";
  const getWorker = async () => (worker ??= await ocrWorker(onProgress, () => current));
  const engines = new Set<string>();
  try {
    if (mime === "application/pdf") {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pages: BrowserPage[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        current = `Page ${n} of ${doc.numPages}`;
        onProgress(`${current} — checking for a text layer`, (n - 1) / doc.numPages);
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        // Rebuild lines from item positions: PDF generators do not reliably
        // mark line ends in the text layer.
        const pageHeight = page.getViewport({ scale: 1 }).height;
        const words: OcrWord[] = [];
        for (const item of content.items) {
          if (!("str" in item) || !item.str.trim()) continue;
          const [, , , d, x, y] = item.transform as number[];
          const h = item.height || Math.abs(d) || 10;
          words.push({ text: item.str, x0: x, x1: x + item.width, y0: pageHeight - y - h, y1: pageHeight - y, confidence: 100 });
        }
        const layer = wordsToText(words);
        if (layer.replace(/\s/g, "").length >= MIN_TEXT_LAYER_CHARS) {
          pages.push({ page: n, method: "pdf_text", text: layer, confidence: null });
          engines.add(`pdf.js ${PDFJS_VERSION} text layer`);
          continue;
        }
        const base = page.getViewport({ scale: 1 });
        // Render width chosen by measurement on the pilot scans: 1100–1300 px
        // wide gave the most correct fields with Tesseract; larger renders
        // were measurably worse (see ARCHITECTURE.md, "OCR render width").
        const viewport = page.getViewport({ scale: OCR_RENDER_WIDTH / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvas, viewport }).promise;
        const w = await getWorker();
        const { data } = await w.recognize(canvas);
        pages.push({ page: n, method: "ocr", text: data.text, confidence: Math.round(data.confidence * 100) / 100 });
        engines.add(`tesseract.js ${TESSERACT_VERSION} (browser, eng, psm 4)`);
        canvas.width = canvas.height = 0;
      }
      return { engine: [...engines].join(" + ") || "pdf.js", pages };
    }
    current = "Image";
    const w = await getWorker();
    const { data } = await w.recognize(file);
    return {
      engine: `tesseract.js ${TESSERACT_VERSION} (browser, eng, psm 4)`,
      pages: [{ page: 1, method: "ocr", text: data.text, confidence: Math.round(data.confidence * 100) / 100 }],
    };
  } finally {
    if (worker) await (worker as TesseractWorker).terminate();
  }
}
