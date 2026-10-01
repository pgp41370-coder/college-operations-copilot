import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";
import { getMyFeedback, submitFeedback } from "@/lib/server/feedback";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireApiUser({ mutating: false });
  const { id } = await ctx.params;
  return NextResponse.json({ feedback: await getMyFeedback(getSql(), user, id) });
});

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const feedback = await submitFeedback(getSql(), user, id, await req.json());
  return NextResponse.json({ feedback });
});
