import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** An error whose message is safe to show to the user. */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Record") => new AppError(404, `${what} not found.`);

/** Wraps a route handler: maps AppError/ZodError to JSON, hides internals. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Invalid input.", details: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
          { status: 400 },
        );
      }
      // Log without request bodies or document contents.
      console.error("unhandled error:", err instanceof Error ? `${err.name}: ${err.message}` : "unknown");
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
