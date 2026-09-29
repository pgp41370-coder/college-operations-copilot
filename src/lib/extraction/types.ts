import type { SourceKind } from "../templates/schema";

export type ExtractionMethod = "pdf_text" | "ocr" | "none";

/** Text of one page of one source document, as produced by extraction. */
export interface PageText {
  sourceId: string;
  kind: SourceKind;
  filename: string;
  page: number;
  text: string;
  method: ExtractionMethod;
  /** 0–100 engine confidence for OCR; null for text-layer extraction. */
  confidence: number | null;
}

/** A value for a template field found in a specific place of a specific source. */
export interface FieldCandidate {
  fieldKey: string;
  value: string;
  normalized: string;
  sourceId: string;
  page: number;
  /** 0–1. Combines rule reliability with OCR confidence. */
  confidence: number;
  method: "deterministic_parser" | "llm";
  /** Machine-readable name of the rule that produced the value. */
  rule: string;
  /** The exact text the value was read from. */
  snippet: string;
}
