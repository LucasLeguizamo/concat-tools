import { z } from "zod";
import { authenticateApi, type ApiAuth } from "../../../lib/api-auth";
import {
  createApiToken,
  DEFAULT_EXPIRY_DAYS,
  listApiTokens,
  MAX_EXPIRY_DAYS,
  revokeApiToken,
  TooManyTokensError,
} from "../../../lib/auth/api-tokens";
import { isScopeSubset } from "../../../lib/auth/oauth-server";
import { UUID_RE } from "../../../lib/auth/ui";
import { unauthorized } from "../../../lib/bearer";
import { moduleIds } from "../../../lib/modules/registry";
import { toSafeError } from "../../../lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

const problem = (status: number, error: string, message: string, fix: string) =>
  Response.json({ error, module: "gateway", message, fix, next_action: "none" }, { status, headers: NO_STORE });

/**
 * Gestion de tokens: solo sesion web o access token OAuth. Un token de API (cgw_) NO puede crear, listar ni
 * revocar tokens: si se filtra uno, no puede acuñar mas ni ampliar su alcance.
 */
async function authorize(request: Request): Promise<ApiAuth | Response> {
  const auth = await authenticateApi(request);
  if (!auth) return unauthorized();
  if (auth.via === "api-token") {
    return problem(403, "forbidden", "Un token de API no puede gestionar tokens.", "Usa tu sesion (concat login) o la web.");
  }
  return auth;
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scope: z.array(z.string()).min(1).default(["*"]),
  expires_in_days: z.number().int().min(1).max(MAX_EXPIRY_DAYS).default(DEFAULT_EXPIRY_DAYS),
});

export async function POST(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth instanceof Response) return auth;
  const parsed = createSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return problem(400, "invalid_request", "Cuerpo invalido: se espera {name, scope?, expires_in_days?}.", `expires_in_days entre 1 y ${MAX_EXPIRY_DAYS}; name hasta 60 caracteres.`);
  }
  const { name, expires_in_days } = parsed.data;
  const known = new Set(["*", ...moduleIds()]);
  const scope = parsed.data.scope.includes("*") ? ["*"] : [...new Set(parsed.data.scope)].sort();
  const unknown = scope.filter((s) => !known.has(s));
  if (unknown.length > 0) {
    return problem(400, "invalid_scope", `Modulos desconocidos: ${unknown.map((s) => s.slice(0, 32)).join(", ")}.`, `Modulos validos: ${moduleIds().join(", ")}, o *.`);
  }
  // El token nuevo no puede tener mas alcance que quien lo crea.
  if (!isScopeSubset(scope, auth.scope)) {
    return problem(403, "invalid_scope", "El scope pedido excede el de tu sesion.", "Pide solo modulos que tu token ya cubre.");
  }
  try {
    const created = await createApiToken(auth.userId, { name, scope, expiresInDays: expires_in_days });
    // El secreto se muestra una sola vez: aqui y nunca mas.
    return Response.json(created, { status: 201, headers: NO_STORE });
  } catch (e) {
    if (e instanceof TooManyTokensError) {
      return problem(409, "too_many_tokens", "Ya tienes el maximo de tokens activos.", "Revoca alguno (concat tokens revoke <id>).");
    }
    console.error("api/tokens POST", toSafeError(e));
    return problem(500, "internal_error", "No se pudo crear el token.", "Reintenta.");
  }
}

export async function GET(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth instanceof Response) return auth;
  return Response.json({ tokens: await listApiTokens(auth.userId) }, { headers: NO_STORE });
}

/** `DELETE /api/tokens?id=<uuid>` */
export async function DELETE(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) return problem(400, "invalid_request", "Falta el parametro id (uuid).", "Usa `concat tokens list` para ver los ids.");
  if (!(await revokeApiToken(auth.userId, id))) {
    return problem(404, "not_found", "No existe un token activo con ese id.", "Usa `concat tokens list` para ver los ids.");
  }
  return Response.json({ revoked: true, id }, { headers: NO_STORE });
}
