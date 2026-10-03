import { authenticateApi } from "../../../../lib/api-auth";
import { scopeAllows, unauthorized } from "../../../../lib/bearer";
import { disconnectModule } from "../../../../lib/disconnect";
import { ActionableException } from "../../../../lib/modules/errors";
import { getModule } from "../../../../lib/modules/registry";
import { toSafeError } from "../../../../lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/** DELETE = desconectar el modulo (revoca en Google si ningun otro lo necesita). Sesion web o token del gateway. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authenticateApi(request);
  if (!auth) return unauthorized();
  const { id } = await ctx.params;
  const mod = getModule(id);
  if (!mod) {
    return Response.json(
      { error: "unknown_module", module: "gateway", message: "Modulo desconocido.", fix: "Consulta /api/status para ver los ids.", next_action: "none" },
      { status: 404, headers: NO_STORE },
    );
  }
  if (!scopeAllows(auth.scope, mod.id)) {
    return Response.json(
      { error: "forbidden", module: mod.id, message: "El token no tiene alcance sobre este modulo.", fix: "Usa un token con este modulo en su scope.", next_action: "none" },
      { status: 403, headers: NO_STORE },
    );
  }
  try {
    return Response.json(await disconnectModule(auth.userId, mod.id), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ActionableException) return Response.json(e.actionable, { status: 502, headers: NO_STORE });
    console.error("api/modules DELETE", toSafeError(e));
    return Response.json(
      { error: "internal_error", module: mod.id, message: "No se pudo desconectar el modulo.", fix: "Reintenta; si persiste, avisa al administrador.", next_action: "retry" },
      { status: 500, headers: NO_STORE },
    );
  }
}
