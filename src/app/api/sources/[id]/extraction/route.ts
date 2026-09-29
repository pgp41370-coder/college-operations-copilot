import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractionPagesInput, saveExtraction } from "@/lib/server/activities";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";

type Ctx = { params: Promise<{ id: string }> };

/** Receives per-page text produced by the in-browser extractor. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const result = await saveExtraction(getSql(), user, id, extractionPagesInput.parse(await req.json()));
  return NextResponse.json(result);
});
