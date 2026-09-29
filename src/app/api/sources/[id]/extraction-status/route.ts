import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { markExtraction } from "@/lib/server/activities";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const body = z.object({ status: z.enum(["processing", "failed"]), error: z.string().max(300).optional() }).parse(await req.json());
  await markExtraction(getSql(), user, id, body.status, body.error);
  return NextResponse.json({ ok: true });
});
