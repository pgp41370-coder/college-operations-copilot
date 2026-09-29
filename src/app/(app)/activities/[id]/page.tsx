import { notFound } from "next/navigation";
import { getSql } from "@/lib/db";
import { aiStatus } from "@/lib/ai/provider";
import { loadActivityBundle } from "@/lib/server/activities";
import { requirePageUser } from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";
import { Workspace } from "./workspace";

export const metadata = { title: "Activity" };

export default async function ActivityPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageUser();
  const { id } = await props.params;
  const { tab } = await props.searchParams;
  let bundle;
  try {
    bundle = await loadActivityBundle(getSql(), user, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  return <Workspace bundle={JSON.parse(JSON.stringify(bundle))} initialTab={tab ?? "overview"} user={{ id: user.id, role: user.role }} ai={aiStatus()} />;
}
