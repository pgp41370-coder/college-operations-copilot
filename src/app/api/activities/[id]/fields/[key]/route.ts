import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { chooseCandidate, confirmField, setField } from "@/lib/server/activities";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set"), value: z.string().max(20000).nullable(), note: z.string().max(500).optional() }),
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("choose"), candidateId: z.string().max(64) }),
]);

type Ctx = { params: Promise<{ id: string; key: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id, key } = await ctx.params;
  const body = input.parse(await req.json());
  const sql = getSql();
  if (body.action === "set") await setField(sql, user, id, key, { value: body.value, note: body.note });
  else if (body.action === "confirm") await confirmField(sql, user, id, key);
  else await chooseCandidate(sql, user, id, key, body.candidateId);
  return NextResponse.json({ ok: true });
});
