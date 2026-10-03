import { z } from "zod";

export type VaultKey = { version: string; key: Buffer };

/**
 * Parsea `v1:base64key,v2:base64key`. La ULTIMA entrada es la clave activa
 * (con la que se cifra); las anteriores solo sirven para descifrar.
 * Cada clave debe decodificar a exactamente 32 bytes.
 */
export function parseVaultKeys(raw: string): VaultKey[] {
  const entries = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (entries.length === 0) throw new Error("VAULT_KEYS vacio");
  const seen = new Set<string>();
  return entries.map((entry) => {
    const idx = entry.indexOf(":");
    if (idx <= 0) throw new Error("VAULT_KEYS: formato esperado v1:base64key,v2:base64key");
    const version = entry.slice(0, idx);
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(version)) throw new Error("VAULT_KEYS: version invalida");
    if (seen.has(version)) throw new Error(`VAULT_KEYS: version duplicada ${version}`);
    seen.add(version);
    const key = Buffer.from(entry.slice(idx + 1), "base64");
    if (key.length !== 32) throw new Error(`VAULT_KEYS: la clave ${version} debe tener 32 bytes (base64)`);
    return { version, key };
  });
}

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  PUBLIC_URL: z
    .url()
    .transform((u) => u.replace(/\/+$/, "")),
  VAULT_KEYS: z.string().superRefine((v, ctx) => {
    try {
      parseVaultKeys(v);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: (e as Error).message });
    }
  }),
  CRON_SECRET: z.string().min(16),
  JWT_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Lectura lazy y memoizada: nada se valida al importar (next build no necesita env). */
export function getEnv(): Env {
  if (cached) return cached;
  const result = schema.safeParse(process.env);
  if (!result.success) {
    // Solo nombres de variable y motivo; nunca valores.
    const detail = result.error.issues
      .map((i) => `${i.path.join(".") || "(env)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Configuracion de entorno invalida: ${detail}`);
  }
  cached = result.data;
  return cached;
}

/** Solo DATABASE_URL (migraciones y scripts no necesitan el resto del entorno). */
export function getDatabaseUrl(): string {
  const r = schema.shape.DATABASE_URL.safeParse(process.env.DATABASE_URL);
  if (!r.success) throw new Error("Configuracion de entorno invalida: DATABASE_URL requerida");
  return r.data;
}

/** Solo para tests. */
export function resetEnvCache(): void {
  cached = undefined;
}
