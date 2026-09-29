import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSql } from "@/lib/db";
import { assertSameOrigin, currentUser, destroySession, SESSION_COOKIE } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { handle } from "@/lib/server/errors";

export const POST = handle(async () => {
  await assertSameOrigin();
  const store = await cookies();
  const user = await currentUser();
  await destroySession(getSql(), store.get(SESSION_COOKIE)?.value);
  if (user) await audit(getSql(), { actorId: user.id, action: "auth.logout", entityType: "user", entityId: user.id });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
