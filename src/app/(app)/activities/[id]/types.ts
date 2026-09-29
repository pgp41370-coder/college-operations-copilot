import type { loadActivityBundle } from "@/lib/server/activities";

type Raw = Awaited<ReturnType<typeof loadActivityBundle>>;

/** JSON-serialized bundle (dates become ISO strings). */
export type Bundle = Jsonify<Raw>;

type Jsonify<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;
