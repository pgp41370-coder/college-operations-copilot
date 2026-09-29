import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getProvider } from "@/lib/ai/provider";
import { requireApiUser } from "@/lib/server/auth";
import { runLlmExtraction } from "@/lib/server/ai-extraction";
import { handle } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const sql = getSql();
  await rateLimit(sql, "ai-extract", user.id, 20, 60 * 60);
  return NextResponse.json(await runLlmExtraction(sql, user, id, getProvider()));
});
