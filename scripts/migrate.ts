/**
 * Applies pending migrations. Run with `pnpm db:migrate`.
 * Safe to run repeatedly — Drizzle tracks what has already been applied.
 *
 * Also runs on every deploy via the `vercel-build` script, so a fresh
 * deployment creates its tables before the app serves a request. Exiting
 * non-zero here fails the build, which is what we want: a failed deploy is far
 * easier to diagnose than a site that builds and then errors on every page.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "  Locally:  copy .env.example to .env and fill it in.\n" +
      "  On Vercel: add it under Project → Settings → Environment Variables.",
  );
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  await migrate(drizzle(sql), { migrationsFolder: "./lib/db/migrations" });
  console.log("Migrations applied.");
} catch (error) {
  console.error("Migration failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
