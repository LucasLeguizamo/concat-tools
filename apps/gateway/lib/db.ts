import postgres from "postgres";
import { getDatabaseUrl } from "./env";

export type Sql = postgres.Sql;

const g = globalThis as unknown as { __concatSql?: Sql };

/** Cliente Postgres lazy (singleton; sobrevive al HMR de dev). */
export function getDb(): Sql {
  if (!g.__concatSql) {
    g.__concatSql = postgres(getDatabaseUrl(), {
      max: 5,
      idle_timeout: 20,
      // Compatible con poolers en modo transaccion (Neon/Supabase pooler).
      prepare: false,
    });
  }
  return g.__concatSql;
}

export async function closeDb(): Promise<void> {
  if (g.__concatSql) {
    await g.__concatSql.end({ timeout: 5 });
    g.__concatSql = undefined;
  }
}
