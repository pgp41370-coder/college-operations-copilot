import { z } from "zod";
import { getSql } from "@/lib/db";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";
import { buildExport } from "@/lib/server/exports";

type Ctx = { params: Promise<{ id: string }> };

const query = z.object({
  type: z.enum(["activity_report", "detailed_report", "attendance_summary", "attendance_csv", "manifest"]),
  format: z.enum(["pdf", "docx", "csv", "json"]).default("pdf"),
});

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser({ mutating: false });
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const { type, format } = query.parse({ type: url.searchParams.get("type"), format: url.searchParams.get("format") ?? undefined });
  const { body, contentType, filename } = await buildExport(getSql(), user, id, type, format);
  return new Response(body.slice().buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
