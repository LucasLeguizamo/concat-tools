import { createHash, timingSafeEqual } from "node:crypto";
import { runProbe } from "../../../../lib/connection";
import { getDb } from "../../../../lib/db";
import { getEnv } from "../../../../lib/env";
import { cleanupExpired } from "../../../../lib/maintenance";
import { getModule } from "../../../../lib/modules/registry";
import { toSafeError } from "../../../../lib/safe-error";
import type { ModuleId, ModuleStatus } from "../../../../lib/modules/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const USER_CONCURRENCY = 5;

const digest = (s: string) => createHash("sha256").update(s).digest();

function authorized(request: Request): boolean {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  return !!m?.[1] && timingSafeEqual(digest(m[1]), digest(getEnv().CRON_SECRET));
}

/**
 * Chequeo diario (spec §6): por cada usuario x modulo conectado -> refresh del token,
 * comparacion de scopes otorgados vs esperados y probe. runProbe persiste estado y fecha.
 * Luego borra filas expiradas.
 */
export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return new Response("unauthorized", { status: 401 });

  const rows = await getDb()<{ user_id: string; module: string }[]>`
    SELECT user_id, module FROM module_state WHERE status = 'connected' ORDER BY user_id, module
  `;
  const byUser = new Map<string, ModuleId[]>();
  for (const r of rows) {
    if (!getModule(r.module)) continue;
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.module as ModuleId]);
  }

  const counts: Partial<Record<ModuleStatus, number>> = {};
  let changed = 0;
  let failures = 0;

  const checkUser = async ([userId, ids]: [string, ModuleId[]]) => {
    for (const id of ids) {
      const mod = getModule(id);
      if (!mod) continue;
      try {
        // runProbe = (1) refresh del token + (2) scopes otorgados vs esperados (ambos en getAccessToken)
        // + (3) probe del modulo; persiste estado, fecha y error saneado.
        const status = await runProbe(userId, id);
        counts[status] = (counts[status] ?? 0) + 1;
        if (status !== "connected") changed++;
      } catch {
        failures++;
      }
    }
  };

  const entries = [...byUser.entries()];
  for (let i = 0; i < entries.length; i += USER_CONCURRENCY) {
    await Promise.all(entries.slice(i, i + USER_CONCURRENCY).map(checkUser));
  }

  // Limpieza de filas expiradas (rate_limits, pending_auth, codes, device_codes, refresh, sesiones).
  let cleaned: Record<string, number> | null = null;
  try {
    cleaned = await cleanupExpired(getDb());
  } catch (e) {
    console.error("cron/cleanup", toSafeError(e));
  }

  return Response.json({
    checked: [...byUser.values()].flat().length,
    changed,
    failures,
    by_status: counts,
    cleaned,
  });
}
