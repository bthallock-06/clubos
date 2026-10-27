/**
 * Database access. One Postgres dialect everywhere:
 *   local  -> PGlite (Postgres compiled to WASM, files in ./.data, no install)
 *   hosted -> any Postgres, selected by setting DATABASE_URL
 *
 * Application code only ever sees the `Db` type, so moving hosts is a config
 * change and not a code change.
 */
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import * as schema from "./schema";

export type Db = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
/** A Db or an open transaction. Domain functions accept either. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");
const LOCAL_DATA_DIR = path.join(process.cwd(), ".data", "pg");

export type DbHandle = {
  db: Db;
  migrate: () => Promise<void>;
  close: () => Promise<void>;
};

export async function openDb(opts?: { memory?: boolean }): Promise<DbHandle> {
  const url = process.env.DATABASE_URL;

  if (url && !opts?.memory) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url, max: 10 });
    const db = drizzle(pool, { schema });
    return {
      db: db as unknown as Db,
      migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_DIR }),
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (!opts?.memory) {
    const fs = await import("node:fs");
    fs.mkdirSync(path.dirname(LOCAL_DATA_DIR), { recursive: true });
  }
  const client = new PGlite(opts?.memory ? undefined : LOCAL_DATA_DIR);
  const db = drizzle(client, { schema });
  return {
    db: db as unknown as Db,
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_DIR }),
    close: () => client.close(),
  };
}

// The web process keeps one handle for its lifetime. Stored on globalThis so
// hot reload in development does not open the data directory twice.
const globalForDb = globalThis as unknown as { __clubosDb?: Promise<DbHandle> };

export async function getDb(): Promise<Db> {
  globalForDb.__clubosDb ??= openDb();
  return (await globalForDb.__clubosDb).db;
}
