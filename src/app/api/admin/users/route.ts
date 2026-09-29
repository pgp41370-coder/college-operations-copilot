import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";
import { createUser, createUserInput } from "@/lib/server/users";

export const POST = handle(async (req: Request) => {
  const user = await requireApiUser();
  const id = await createUser(getSql(), user, createUserInput.parse(await req.json()));
  return NextResponse.json({ id }, { status: 201 });
});
