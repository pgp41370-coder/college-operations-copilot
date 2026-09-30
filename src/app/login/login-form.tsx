"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { api, errorText } from "@/components/client-api";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        try {
          await api("/api/auth/login", { body: { email: f.get("email"), password: f.get("password") } });
          router.replace("/dashboard");
          router.refresh();
        } catch (err) {
          setError(errorText(err));
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="input py-2" aria-invalid={!!error} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input py-2" aria-invalid={!!error} />
      </div>
      {error && (
        <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary btn-lg w-full" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {busy ? "Signing in…" : "Sign in"}
        {!busy && <ArrowRight className="h-4 w-4" aria-hidden />}
      </button>
    </form>
  );
}
