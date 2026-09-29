/**
 * Rebuilds reading-order text from OCR word boxes.
 *
 * Tesseract's own text order depends on its block segmentation, which varies
 * with render scale: on table-style reports it sometimes emits the label
 * column and the value column as separate blocks, detaching "Category of the
 * Activity" from its value. Word bounding boxes are stable, so lines are
 * rebuilt geometrically: words whose vertical centres align form one line,
 * ordered left to right. A blank line is inserted only where there is a real
 * vertical gap, preserving paragraph breaks for the parser.
 *
 * No words are added, removed or changed — only their order and line breaks.
 */
export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

export function wordsToText(words: OcrWord[]): string {
  const ws = words.filter((w) => w.text.trim() && w.y1 > w.y0);
  if (!ws.length) return "";
  const h = median(ws.map((w) => w.y1 - w.y0)) || 1;
  const sorted = [...ws].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);

  type Row = { words: OcrWord[]; yc: number; top: number; bottom: number };
  const rows: Row[] = [];
  for (const w of sorted) {
    const yc = (w.y0 + w.y1) / 2;
    const row = rows[rows.length - 1];
    if (row && Math.abs(yc - row.yc) <= 0.5 * h) {
      row.words.push(w);
      row.yc = (row.yc * (row.words.length - 1) + yc) / row.words.length;
      row.top = Math.min(row.top, w.y0);
      row.bottom = Math.max(row.bottom, w.y1);
    } else {
      rows.push({ words: [w], yc, top: w.y0, bottom: w.y1 });
    }
  }

  const lines: string[] = [];
  let prev: Row | null = null;
  for (const row of rows) {
    if (prev && row.yc - prev.yc > 2.2 * h) lines.push("");
    lines.push(
      row.words
        .sort((a, b) => a.x0 - b.x0)
        .map((w) => w.text.trim())
        .join(" "),
    );
    prev = row;
  }
  return lines.join("\n");
}

/** Parses Tesseract TSV output (CLI `tsv` config) into word boxes. */
export function wordsFromTsv(tsv: string): OcrWord[] {
  const out: OcrWord[] = [];
  for (const line of tsv.split("\n").slice(1)) {
    const c = line.split("\t");
    if (c.length < 12 || c[0] !== "5" || !c[11]?.trim()) continue;
    const [left, top, width, height] = c.slice(6, 10).map(Number);
    out.push({ text: c[11], x0: left, y0: top, x1: left + width, y1: top + height, confidence: Number(c[10]) });
  }
  return out;
}
