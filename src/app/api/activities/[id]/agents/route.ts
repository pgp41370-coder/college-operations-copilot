import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { runAgents } from "@/lib/server/agents";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

/** A run with a local model can take minutes; without one it takes about a second. */
export const maxDuration = 300;

export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const sql = getSql();
  await rateLimit(sql, "agents", user.id, 30, 60 * 60);
  return NextResponse.json(await runAgents(sql, user, id));
});
