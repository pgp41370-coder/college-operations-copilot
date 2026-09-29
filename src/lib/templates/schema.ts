import { z } from "zod";

export const FIELD_TYPES = ["text", "longtext", "date", "time", "integer"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const SOURCE_KINDS = [
  "poster",
  "notice",
  "activity_report",
  "detailed_report",
  "attendance",
  "photo",
  "supporting",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  poster: "Poster",
  notice: "Notice",
  activity_report: "Existing activity report",
  detailed_report: "Existing detailed report",
  attendance: "Attendance sheet",
  photo: "Photograph",
  supporting: "Supporting document",
};

const fieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  group: z.enum(["details", "participants", "narrative", "signatories", "other"]),
  /** Labels the deterministic parser looks for in "Label: value" layouts. */
  aliases: z.array(z.string().min(2)).default([]),
  help: z.string().optional(),
});

const rowSchema = z.object({
  label: z.string(),
  /** Text with {field_key} placeholders. */
  value: z.string(),
});

const signatorySchema = z.object({
  heading: z.string(),
  /** Lines under the signature space; may contain {field_key} placeholders. */
  lines: z.array(z.string()),
});

export const templateDefinitionSchema = z.object({
  institution: z.object({
    name: z.string().min(1),
    department: z.string().min(1),
  }),
  dateFormat: z.enum(["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY"]),
  fields: z.array(fieldSchema).min(1),
  activityReport: z.object({
    titleLines: z.array(z.string()),
    heading: z.string(),
    detailRows: z.array(rowSchema),
    narrativeRows: z.array(rowSchema),
    signatories: z.array(signatorySchema),
  }),
  detailedReport: z.object({
    letterheadLines: z.array(z.string()),
    dateLine: z.string(),
    heading: z.string(),
    topicLabel: z.string(),
    topicField: z.string(),
    descriptionField: z.string(),
    impactHeading: z.string(),
    impactField: z.string(),
    /**
     * Sentence used to draft the event description when none was extracted or
     * entered. It only combines existing field values; it never adds facts.
     */
    descriptionDraft: z.object({
      intro: z.string(),
      appendFields: z.array(z.string()),
    }),
    /** Impact analysis draft falls back to these fields' values, verbatim. */
    impactDraftFields: z.array(z.string()),
    signatories: z.array(signatorySchema),
  }),
  attendance: z.object({
    heading: z.string(),
    maleField: z.string(),
    femaleField: z.string(),
    totalField: z.string(),
  }),
  packet: z.object({
    /** Section order for the compiled activity packet. */
    sections: z.array(
      z.object({
        include: z.enum([
          "generated_activity_report",
          "generated_detailed_report",
          ...SOURCE_KINDS,
        ]),
        heading: z.string().optional(),
      }),
    ),
  }),
  /** Deterministic tie-break order when text fields have several candidates. */
  sourcePriority: z.array(z.enum(SOURCE_KINDS)),
});

export type TemplateDefinition = z.infer<typeof templateDefinitionSchema>;
export type TemplateField = TemplateDefinition["fields"][number];

export function validateTemplateDefinition(input: unknown):
  | { ok: true; definition: TemplateDefinition }
  | { ok: false; errors: string[] } {
  const parsed = templateDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const def = parsed.data;
  const keys = new Set<string>();
  const errors: string[] = [];
  for (const f of def.fields) {
    if (keys.has(f.key)) errors.push(`fields: duplicate key "${f.key}"`);
    keys.add(f.key);
  }
  const referenced = [
    def.detailedReport.topicField,
    def.detailedReport.descriptionField,
    def.detailedReport.impactField,
    ...def.detailedReport.descriptionDraft.appendFields,
    ...def.detailedReport.impactDraftFields,
    def.attendance.maleField,
    def.attendance.femaleField,
    def.attendance.totalField,
  ];
  const placeholderText = [
    ...def.activityReport.titleLines,
    ...def.activityReport.detailRows.map((r) => r.value),
    ...def.activityReport.narrativeRows.map((r) => r.value),
    ...def.activityReport.signatories.flatMap((s) => s.lines),
    ...def.detailedReport.signatories.flatMap((s) => s.lines),
    def.detailedReport.dateLine,
    def.detailedReport.descriptionDraft.intro,
  ].join(" ");
  for (const m of placeholderText.matchAll(/\{([a-z0-9_.]+)\}/g)) referenced.push(m[1]);
  for (const key of referenced) {
    if (key.startsWith("institution.")) continue;
    if (!keys.has(key)) errors.push(`references unknown field "${key}"`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, definition: def };
}
