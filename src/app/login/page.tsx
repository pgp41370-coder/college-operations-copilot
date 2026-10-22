import { redirect } from "next/navigation";
import { CheckCircle2, FileSearch, ScanText, ShieldCheck, UserCheck } from "lucide-react";
import { currentUser } from "@/lib/server/auth";
import { Notice, PRIVACY_NOTICE } from "@/components/ui";
import { LoginForm } from "./login-form";
import { APP_MARK, APP_NAME, APP_TAGLINE } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

const PRINCIPLES = [
  { icon: ScanText, title: "AI assists", body: "Text is read from notices, reports and scans, and values are proposed." },
  { icon: FileSearch, title: "Evidence supports", body: "Every value cites the document, page and exact snippet it came from." },
  { icon: ShieldCheck, title: "Validation checks", body: "Conflicting dates, missing fields and count mismatches block approval." },
  { icon: UserCheck, title: "Humans approve", body: "Only an authenticated faculty member can approve a record." },
];

export default async function LoginPage() {
  const configured = !!process.env.DATABASE_URL;
  if (configured && (await currentUser())) redirect("/dashboard");
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-deep px-12 py-12 text-white lg:flex lg:flex-col">
        <div aria-hidden className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div aria-hidden className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand opacity-30 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-[13px] font-bold ring-1 ring-white/20">{APP_MARK}</span>
          <span className="leading-tight">
            <span className="block text-[14px] font-semibold">{APP_NAME}</span>
            <span className="block text-[12px] text-white/60">{APP_TAGLINE}</span>
          </span>
        </div>
        <div className="relative mt-auto max-w-lg">
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight">Activity documentation that shows its evidence.</h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-white/70">
            Turn a notice, an attendance sheet and photographs into the institution&apos;s activity report, detailed report and attendance summary — with every value traceable to a source page and every record approved by a person.
          </p>
          <ul className="mt-8 space-y-4">
            {PRINCIPLES.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <p.icon className="h-4 w-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-[13.5px] font-semibold">{p.title}</span>
                  <span className="block text-[13px] text-white/65">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-10 flex items-center gap-2 text-[12px] text-white/50">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Pilot: Department of Mechanical Engineering
        </p>
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="anim-page w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-[13px] font-bold text-white">{APP_MARK}</span>
            <p className="mt-3 text-[15px] font-semibold">{APP_NAME}</p>
            <p className="t-meta">{APP_TAGLINE}</p>
          </div>
          <h2 className="t-page">Sign in</h2>
          <p className="t-meta mt-1">Use the account your administrator created for you.</p>
          <div className="mt-6">
            {configured ? <LoginForm /> : <Notice tone="error" title="Not configured">The database is not configured for this deployment yet. See SETUP.md.</Notice>}
          </div>
          <p className="t-meta mt-8 border-t border-line pt-4 text-[11.5px]">Accounts are created by your administrator — there is no public sign-up. {PRIVACY_NOTICE}</p>
        </div>
      </section>
    </main>
  );
}
