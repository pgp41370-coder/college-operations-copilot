import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSql } from "../db";
import { AppError } from "./errors";
import { SESSION_COOKIE, userForToken, type User } from "./auth-core";

export * from "./auth-core";

/** Current user from the session cookie, or null. */
export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  return userForToken(getSql(), store.get(SESSION_COOKIE)?.value);
}

/** For pages: redirect to /login when signed out. */
export async function requirePageUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * For mutating API routes: require a session and a same-origin request.
 * SameSite=Lax cookies already block most cross-site posts; the Origin check
 * closes the rest.
 */
export async function requireApiUser(opts: { mutating?: boolean } = { mutating: true }): Promise<User> {
  if (opts.mutating !== false) await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw new AppError(401, "Please sign in.");
  return user;
}

export async function assertSameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!origin || !host) throw new AppError(403, "Cross-origin request rejected.");
  try {
    if (new URL(origin).host !== host) throw new Error();
  } catch {
    throw new AppError(403, "Cross-origin request rejected.");
  }
}

export function requireAdmin(user: User) {
  if (user.role !== "admin") throw new AppError(403, "Administrator access required.");
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
