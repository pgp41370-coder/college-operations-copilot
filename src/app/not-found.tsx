import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="card max-w-md px-6 py-10 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-3 text-muted ring-1 ring-line">
          <FileQuestion className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="t-section mt-4">Not found</h1>
        <p className="t-body mt-1.5 text-fg-2">This page does not exist, or you do not have access to it.</p>
        <Link href="/dashboard" className="btn btn-primary mt-5">Go to dashboard</Link>
      </div>
    </main>
  );
}
