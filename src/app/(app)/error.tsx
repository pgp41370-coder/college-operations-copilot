"use client";
import { useEffect } from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";
import Link from "next/link";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="card mx-auto mt-10 max-w-lg px-6 py-10 text-center" role="alert">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft text-danger ring-1 ring-danger-line">
        <AlertOctagon className="h-5 w-5" aria-hidden />
      </span>
      <h1 className="t-section mt-4">This page could not be loaded</h1>
      <p className="t-body mt-1.5 text-fg-2">Nothing was changed. Try again; if it keeps failing, the database or network may be unavailable.</p>
      {error.digest && <p className="t-meta mt-2">Reference: <code className="font-mono">{error.digest}</code></p>}
      <div className="mt-5 flex justify-center gap-2">
        <button className="btn btn-primary" onClick={() => retry()}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Try again
        </button>
        <Link className="btn btn-secondary" href="/dashboard">Go to dashboard</Link>
      </div>
    </div>
  );
}
