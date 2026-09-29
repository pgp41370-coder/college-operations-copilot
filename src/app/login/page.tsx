import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/auth";
import { PRIVACY_NOTICE } from "@/components/ui";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  let configured = true;
  try {
    if (await currentUser()) redirect("/dashboard");
  } catch (e) {
    if (e instanceof Error && e.message.includes("DATABASE_URL is not configured")) configured = false;
    else throw e;
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">CO</div>
          <h1 className="text-lg font-semibold">College Operations Copilot</h1>
          <p className="text-sm text-muted">Activity documentation with source provenance</p>
        </div>
        <div className="card p-6">
          {configured ? <LoginForm /> : <p className="text-sm text-red-700">The database is not configured for this deployment yet. See SETUP.md.</p>}
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          Accounts are created by your administrator. {PRIVACY_NOTICE}
        </p>
      </div>
    </main>
  );
}
