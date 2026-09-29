import type postgres from "postgres";

/** A connection or an open transaction. */
export type Db = postgres.Sql | postgres.TransactionSql;

/** The root connection (can open transactions). */
export type Sql = postgres.Sql;
