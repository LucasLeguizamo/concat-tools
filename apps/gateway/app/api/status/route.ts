import { authenticate, scopeAllows, unauthorized } from "../../../lib/bearer";
import { getModuleStatuses } from "../../../lib/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const claims = await authenticate(request);
  if (!claims) return unauthorized();
  const modules = await getModuleStatuses(claims.userId, (id) => scopeAllows(claims.scope, id));
  return Response.json({ modules }, { headers: { "cache-control": "no-store" } });
}
