import { Pool } from "pg";

const globalForPool = globalThis as unknown as { pgPool?: Pool };

export const pool: Pool =
  globalForPool.pgPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://bench:bench-local-only@127.0.0.1:55432/books",
  });

globalForPool.pgPool = pool;
