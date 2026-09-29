import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { approveActivity, archiveActivity, reopenActivity } from "@/lib/server/activities";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";

const input = z.object({ action: z.enum(["approve", "archive", "reopen"]), reason: z.string().max(500).optional() });
type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const body = input.parse(await req.json());
  const sql = getSql();
  if (body.action === "approve") await approveActivity(sql, user, id);
  else if (body.action === "archive") await archiveActivity(sql, user, id);
  else await reopenActivity(sql, user, id, body.reason ?? "");
  return NextResponse.json({ ok: true });
});
