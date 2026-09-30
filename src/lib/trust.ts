/**
 * Trust state of a field, shared by every screen so they classify the same way.
 *  - verified:      a reviewer entered, chose or confirmed the value (human)
 *  - source_backed: extracted from a cited source at >= 80% confidence, not yet reviewed
 *  - needs_review:  extracted below 80% confidence — must be confirmed
 *  - conflict:      sources disagree — no value is chosen
 *  - missing:       no value and no candidate
 */
export type TrustState = "verified" | "source_backed" | "needs_review" | "conflict" | "missing";

export const LOW_CONFIDENCE = 0.8;

export function trustState(f: { status: string; value: string | null; confidence: string | number | null; edited_by: string | null } | undefined): TrustState {
  if (!f || f.status === "missing" || f.value == null || f.value === "") return f?.status === "conflicting" ? "conflict" : "missing";
  if (f.status === "conflicting") return "conflict";
  if (f.edited_by || f.status === "user_entered") return "verified";
  const c = f.confidence == null ? null : Number(f.confidence);
  return c != null && c < LOW_CONFIDENCE ? "needs_review" : "source_backed";
}

export const TRUST_LABEL: Record<TrustState, string> = {
  verified: "Verified",
  source_backed: "Source-backed",
  needs_review: "Needs review",
  conflict: "Conflict",
  missing: "Not provided",
};

export const TRUST_HELP: Record<TrustState, string> = {
  verified: "Entered, chosen or confirmed by a reviewer",
  source_backed: "Read from a cited source at ≥80% confidence; not yet reviewed",
  needs_review: "Read below 80% confidence — confirm or correct",
  conflict: "Documents disagree — a reviewer must choose",
  missing: "No value found or entered",
};

export function confidenceLevel(c: number | null): "high" | "medium" | "low" | null {
  if (c == null) return null;
  return c >= 0.8 ? "high" : c >= 0.6 ? "medium" : "low";
}
