import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { addSource, addSourceInput } from "@/lib/server/activities";
import { requireApiUser } from "@/lib/server/auth";
import { AppError, handle } from "@/lib/server/errors";
import { MAX_UPLOAD_BYTES } from "@/lib/server/files";
import { rateLimit } from "@/lib/server/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    throw new AppError(413, `The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Please upload a smaller scan.`);
  }
  const sql = getSql();
  await rateLimit(sql, "upload", user.id, 120, 60 * 60);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError(400, "The upload could not be read. Please try again.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError(400, "No file was attached.");
  const meta = addSourceInput.parse({
    kind: form.get("kind"),
    caption: (form.get("caption") as string | null) || undefined,
    sourceInfo: (form.get("sourceInfo") as string | null) || undefined,
  });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await addSource(sql, user, id, { ...meta, filename: file.name, bytes });
  return NextResponse.json(result, { status: 201 });
});
