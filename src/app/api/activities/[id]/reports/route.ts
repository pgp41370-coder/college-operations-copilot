import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { generateReports } from "@/lib/server/activities";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const versions = await generateReports(getSql(), user, id);
  return NextResponse.json({ versions });
});
