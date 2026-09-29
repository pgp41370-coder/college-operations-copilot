import { getSql } from "@/lib/db";
import { getSourceBytes } from "@/lib/server/activities";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";

type Ctx = { params: Promise<{ id: string }> };

/** Streams an original uploaded file to an authorized user. Never cached publicly. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser({ mutating: false });
  const { id } = await ctx.params;
  const { source, data } = await getSourceBytes(getSql(), user, id);
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": source.mime_type,
      "Content-Length": String(data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(source.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
