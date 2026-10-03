import { getDb } from "../db";

// Sesiones web revocables: la cookie lleva un JWT con `sid`; la fila decide si sigue vigente.

/** Crea la sesion y devuelve su `sid`. */
export async function createWebSession(userId: string, ttlSeconds: number): Promise<string> {
  const rows = await getDb()<{ sid: string }[]>`
    INSERT INTO web_sessions (user_id, expires_at)
    VALUES (${userId}, now() + make_interval(secs => ${ttlSeconds}))
    RETURNING sid`;
  return rows[0]!.sid;
}

/** La sesion existe, es de ese usuario, no esta revocada ni expirada. */
export async function isWebSessionActive(sid: string, userId: string): Promise<boolean> {
  const rows = await getDb()<{ sid: string }[]>`
    SELECT sid FROM web_sessions
    WHERE sid = ${sid} AND user_id = ${userId} AND revoked_at IS NULL AND expires_at > now()`;
  return rows.length === 1;
}

export async function revokeWebSession(sid: string): Promise<void> {
  await getDb()`UPDATE web_sessions SET revoked_at = now() WHERE sid = ${sid} AND revoked_at IS NULL`;
}
