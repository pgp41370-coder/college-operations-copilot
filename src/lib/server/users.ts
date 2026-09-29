import { z } from "zod";
import { hashPassword, validatePasswordStrength, type User } from "./auth-core";
import { audit } from "./audit";
import { AppError, notFound } from "./errors";
import type { Db } from "./types";

export const createUserInput = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().min(2).max(120),
  role: z.enum(["faculty", "admin"]),
  password: z.string().min(1).max(200),
});

export async function createUser(sql: Db, actor: User | null, input: z.infer<typeof createUserInput>): Promise<string> {
  if (actor && actor.role !== "admin") throw new AppError(403, "Administrator access required.");
  const weak = validatePasswordStrength(input.password);
  if (weak) throw new AppError(400, weak);
  const [exists] = await sql`select 1 from users where lower(email) = lower(${input.email})`;
  if (exists) throw new AppError(409, "A user with this email already exists.");
  const [u] = await sql<{ id: string }[]>`
    insert into users (email, name, role, password_hash)
    values (${input.email}, ${input.name}, ${input.role}, ${await hashPassword(input.password)}) returning id`;
  await audit(sql, { actorId: actor?.id ?? null, action: "user.created", entityType: "user", entityId: u.id, details: { email: input.email, role: input.role } });
  return u.id;
}

export async function listUsers(sql: Db, actor: User) {
  if (actor.role !== "admin") throw new AppError(403, "Administrator access required.");
  return sql<{ id: string; email: string; name: string; role: string; is_active: boolean; created_at: Date }[]>`
    select id, email, name, role, is_active, created_at from users order by created_at`;
}

export const updateUserInput = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(["faculty", "admin"]).optional(),
  password: z.string().max(200).optional(),
});

export async function updateUser(sql: Db, actor: User, userId: string, input: z.infer<typeof updateUserInput>) {
  if (actor.role !== "admin") throw new AppError(403, "Administrator access required.");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw notFound("User");
  const [u] = await sql<{ id: string; role: string; is_active: boolean }[]>`select id, role, is_active from users where id = ${userId}`;
  if (!u) throw notFound("User");
  if (userId === actor.id && (input.isActive === false || input.role === "faculty")) {
    throw new AppError(400, "You cannot deactivate or demote your own account.");
  }
  let hash: string | null = null;
  if (input.password) {
    const weak = validatePasswordStrength(input.password);
    if (weak) throw new AppError(400, weak);
    hash = await hashPassword(input.password);
  }
  await sql`update users set
      is_active = ${input.isActive ?? u.is_active},
      role = ${input.role ?? u.role},
      password_hash = coalesce(${hash}, password_hash),
      updated_at = now()
    where id = ${userId}`;
  if (input.isActive === false || hash) await sql`delete from sessions where user_id = ${userId}`;
  await audit(sql, {
    actorId: actor.id,
    action: "user.updated",
    entityType: "user",
    entityId: userId,
    details: { isActive: input.isActive, role: input.role, passwordReset: !!hash },
  });
}

export async function changeOwnPassword(sql: Db, user: User, currentPassword: string, newPassword: string, verify: (email: string, pw: string) => Promise<User | null>) {
  const ok = await verify(user.email, currentPassword);
  if (!ok) throw new AppError(400, "Current password is incorrect.");
  const weak = validatePasswordStrength(newPassword);
  if (weak) throw new AppError(400, weak);
  await sql`update users set password_hash = ${await hashPassword(newPassword)}, updated_at = now() where id = ${user.id}`;
  await audit(sql, { actorId: user.id, action: "account.password_changed", entityType: "user", entityId: user.id });
}
