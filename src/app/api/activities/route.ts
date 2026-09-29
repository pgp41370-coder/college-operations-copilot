import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { createActivity, createActivityInput } from "@/lib/server/activities";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";

export const POST = handle(async (req: Request) => {
  const user = await requireApiUser();
  const id = await createActivity(getSql(), user, createActivityInput.parse(await req.json()));
  return NextResponse.json({ id }, { status: 201 });
});
