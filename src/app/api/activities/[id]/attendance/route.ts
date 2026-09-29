import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import {
  addAttendanceRow,
  attendanceRowInput,
  deleteAttendanceRow,
  importAttendanceCsv,
  updateAttendanceRow,
  verifyAllAttendance,
} from "@/lib/server/activities";
import { requireApiUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/errors";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), row: attendanceRowInput }),
  z.object({
    action: z.literal("update"),
    rowId: z.string().max(64),
    row: attendanceRowInput.partial().extend({ verified: z.boolean().optional() }),
  }),
  z.object({ action: z.literal("delete"), rowId: z.string().max(64) }),
  z.object({ action: z.literal("verify_all") }),
  z.object({ action: z.literal("import_csv"), csv: z.string().max(500_000) }),
]);

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const body = input.parse(await req.json());
  const sql = getSql();
  switch (body.action) {
    case "add":
      await addAttendanceRow(sql, user, id, body.row);
      return NextResponse.json({ ok: true });
    case "update":
      await updateAttendanceRow(sql, user, id, body.rowId, body.row);
      return NextResponse.json({ ok: true });
    case "delete":
      await deleteAttendanceRow(sql, user, id, body.rowId);
      return NextResponse.json({ ok: true });
    case "verify_all":
      await verifyAllAttendance(sql, user, id);
      return NextResponse.json({ ok: true });
    case "import_csv":
      return NextResponse.json(await importAttendanceCsv(sql, user, id, body.csv));
  }
});
