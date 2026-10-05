"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/auth/session";
import { disconnectModule } from "../../lib/disconnect";
import { getModule } from "../../lib/modules/registry";
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
