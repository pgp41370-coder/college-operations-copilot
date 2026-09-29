import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";
import { updateUser, updateUserInput } from "@/lib/server/users";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  await updateUser(getSql(), user, id, updateUserInput.parse(await req.json()));
  return NextResponse.json({ ok: true });
});
