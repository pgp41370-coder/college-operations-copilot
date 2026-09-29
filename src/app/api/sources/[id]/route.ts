import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { deleteSource, updateSourceMeta } from "@/lib/server/activities";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const body = z.object({ caption: z.string().max(300).nullable().optional(), sourceInfo: z.string().max(300).nullable().optional() }).parse(await req.json());
  await updateSourceMeta(getSql(), user, id, body);
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  await deleteSource(getSql(), user, id);
  return NextResponse.json({ ok: true });
});
