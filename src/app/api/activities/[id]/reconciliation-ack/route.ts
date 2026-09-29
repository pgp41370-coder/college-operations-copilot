import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { acknowledgeReconciliation } from "@/lib/server/activities";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const { note } = z.object({ note: z.string().max(1000) }).parse(await req.json());
  await acknowledgeReconciliation(getSql(), user, id, note);
  return NextResponse.json({ ok: true });
});
