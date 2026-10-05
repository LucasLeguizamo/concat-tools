"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/auth/session";
import { runProbe } from "../../lib/connection";
import { disconnectModule } from "../../lib/disconnect";
import { getModule } from "../../lib/modules/registry";
import { LIMITS, rateLimiter } from "../../lib/rate-limit";
import { toSafeError } from "../../lib/safe-error";

/** Server action (POST con comprobacion de origen de Next): sin ruta GET que un tercero pueda enlazar. */
export async function disconnectAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fdashboard");
  const mod = getModule(String(formData.get("module") ?? ""));
  if (!mod) redirect("/dashboard?error=unknown_module");
  try {
    await disconnectModule(user.id, mod.id);
  } catch (e) {
    console.error("dashboard/disconnect", toSafeError(e));
    redirect(`/dashboard?error=disconnect_failed&failed=${encodeURIComponent(mod.id)}`);
  }
  redirect(`/dashboard?disconnected=${encodeURIComponent(mod.id)}`);
}

/** Repite el probe del modulo (sin OAuth): para "sin recursos" tras dar acceso en Google, o "verificando". */
export async function recheckAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fdashboard");
  const mod = getModule(String(formData.get("module") ?? ""));
  if (!mod) redirect("/dashboard?error=unknown_module");
  const { limit, windowS } = LIMITS.recheck;
  if (!(await rateLimiter().hit(`recheck:${user.id}:${mod.id}`, limit, windowS)).allowed) {
    redirect(`/dashboard?error=rate_limited&failed=${encodeURIComponent(mod.id)}`);
  }
  try {
    await runProbe(user.id, mod.id);
  } catch (e) {
    console.error("dashboard/recheck", toSafeError(e));
    redirect(`/dashboard?error=recheck_failed&failed=${encodeURIComponent(mod.id)}`);
  }
  redirect(`/dashboard?checked=${encodeURIComponent(mod.id)}`);
}
