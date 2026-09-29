"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** JSON request to our own API; throws ApiError with the server's message. */
export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: opts.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status}).`, res.status, data.details);
  return data as T;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const d = Array.isArray(e.details) ? ` ${e.details.slice(0, 5).join(" ")}` : "";
    return `${e.message}${d}`;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}
