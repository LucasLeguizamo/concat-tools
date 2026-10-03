import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "../lib/db";

// DATABASE_URL viene de .env.local (si existe) o del entorno; ver script db:migrate.
const here = dirname(fileURLToPath(import.meta.url));
const ddl = readFileSync(join(here, "..", "db", "schema.sql"), "utf8");

try {
  await getDb().unsafe(ddl);
  console.log("db:migrate ok");
} catch (e) {
  console.error("db:migrate fallo:", (e as Error).message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
