import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { assertSameOrigin, createSession, sessionCookieOptions, SESSION_COOKIE, verifyCredentials } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { AppError, handle } from "@/lib/server/errors";
import { clearRateLimit, rateLimit } from "@/lib/server/rate-limit";

const input = z.object({ email: z.string().trim().max(200), password: z.string().max(200) });

export const POST = handle(async (req: Request) => {
  await assertSameOrigin();
  const { email, password } = input.parse(await req.json());
  const sql = getSql();
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  await rateLimit(sql, "login-ip", ip, 30, 15 * 60);
  await rateLimit(sql, "login-email", email.toLowerCase(), 8, 15 * 60);
  const user = await verifyCredentials(sql, email, password);
  if (!user) throw new AppError(401, "Incorrect email or password.");
  await clearRateLimit(sql, "login-email", email.toLowerCase());
  const { token, expires } = await createSession(sql, user.id);
  await audit(sql, { actorId: user.id, action: "auth.login", entityType: "user", entityId: user.id });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expires));
  return res;
});
