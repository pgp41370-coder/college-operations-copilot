import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";
import { saveTemplateVersion } from "@/lib/server/templates";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const { definition } = z.object({ definition: z.unknown() }).parse(await req.json());
  const newId = await saveTemplateVersion(getSql(), user, id, definition);
  return NextResponse.json({ id: newId });
});
