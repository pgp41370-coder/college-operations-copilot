import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { requireApiUser, verifyCredentials } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { changeOwnPassword } from "@/lib/server/users";

export const POST = handle(async (req: Request) => {
  const user = await requireApiUser();
  const body = z.object({ currentPassword: z.string().max(200), newPassword: z.string().max(200) }).parse(await req.json());
  const sql = getSql();
  await rateLimit(sql, "password-change", user.id, 10, 15 * 60);
  await changeOwnPassword(sql, user, body.currentPassword, body.newPassword, (e, p) => verifyCredentials(sql, e, p));
  return NextResponse.json({ ok: true });
});
