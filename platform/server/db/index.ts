import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

/**
 * Lazy singleton for the Drizzle ORM client using postgres.js driver.
 *
 * Requires `DATABASE_URL` env var (standard Postgres connection string).
 * The singleton avoids creating multiple connections and mirrors the lazy
 * initialisation pattern used in `stripe.ts`.
 */
let _db: PostgresJsDatabase<typeof schema> | null = null;

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const sql = postgres(url);
    _db = drizzle(sql, { schema });
  }
  return _db;
}
