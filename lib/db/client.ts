import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The connection is created on first query, not on import.
 *
 * That matters for two reasons: `next build` shouldn't need a live database to
 * compile pages, and a serverless invocation that never touches Postgres
 * shouldn't pay to open a connection.
 */
const globalForDb = globalThis as unknown as {
  __tabSql?: ReturnType<typeof postgres>;
  __tabDb?: PostgresJsDatabase<typeof schema>;
};

function connect(): PostgresJsDatabase<typeof schema> {
  if (globalForDb.__tabDb) return globalForDb.__tabDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in — " +
        "`docker compose up -d` gives you the local default.",
    );
  }

  const sql =
    globalForDb.__tabSql ??
    postgres(connectionString, {
      // Serverless instances are short-lived; a large per-instance pool is waste.
      max: process.env.VERCEL ? 1 : 10,
      idle_timeout: 20,
      prepare: false, // required behind a transaction pooler such as Neon's
    });

  const db = drizzle(sql, { schema });

  // Reuse across hot reloads in dev and warm invocations in production.
  globalForDb.__tabSql = sql;
  globalForDb.__tabDb = db;
  return db;
}

/**
 * Proxied so `db.select()` connects on first use while still reading like an
 * ordinary client at every call site.
 */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, property, receiver) {
    return Reflect.get(connect(), property, receiver);
  },
});
