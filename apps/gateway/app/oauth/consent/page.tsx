import { redirect } from "next/navigation";
import { resolveClientForRedirect } from "../../../lib/auth/clients";
import { redirectWithParams } from "../../../lib/auth/http";
import { oauthServer } from "../../../lib/auth/oauth-server";
import { getSessionUser } from "../../../lib/auth/session";
import { button, buttonSecondary, describeScope, Shell, UUID_RE } from "../../../lib/auth/ui";

export const dynamic = "force-dynamic";

async function decide(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  const id = String(formData.get("pending") ?? "");
  if (!user || !UUID_RE.test(id)) redirect("/login");
  const server = oauthServer();

  if (formData.get("decision") !== "approve") {
    const denied = await server.denyAuthorization(id);
    if (!denied) redirect(`/oauth/consent?pending=${id}`);
    redirect(redirectWithParams(denied.redirectUri, { error: "access_denied", state: denied.state }));
  }

  // El documento CIMD pudo cambiar desde /authorize: se revalida antes de emitir el code.
  const pending = await server.getPending(id);
  if (!pending) redirect(`/oauth/consent?pending=${id}`);
  try {
    await resolveClientForRedirect(pending.clientId, pending.redirectUri);
  } catch {
    redirect(`/oauth/consent?pending=${id}`);
  }
  const approved = await server.approveAuthorization(id, user.id);
  if (!approved) redirect(`/oauth/consent?pending=${id}`);
  redirect(redirectWithParams(approved.redirectUri, { code: approved.code, state: approved.state }));
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ pending?: string }> }) {
  const { pending: id = "" } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?pending=${id}`)}`);

  const pending = UUID_RE.test(id) ? await oauthServer().getPending(id) : null;
  if (!pending) {
    return (
      <Shell title="Solicitud expirada">
        <p>Esta solicitud de autorizacion no existe o ya expiro. Vuelve a iniciarla desde tu aplicacion.</p>
      </Shell>
    );
  }

  let clientName: string;
  try {
    clientName = (await resolveClientForRedirect(pending.clientId, pending.redirectUri)).name;
  } catch {
    return (
      <Shell title="Cliente no valido">
        <p>No se pudo validar la aplicacion que solicita acceso.</p>
      </Shell>
    );
  }
  const redirectHost = new URL(pending.redirectUri).host;

  return (
    <Shell title="Autorizar aplicacion">
      <p>
        <strong>{clientName}</strong> quiere acceder a tu cuenta del gateway como <strong>{user.email}</strong>.
      </p>
      <ul>
        <li>Cliente: <code>{pending.clientId}</code></li>
        <li>Volvera a: <code>{redirectHost}</code></li>
        <li>Permisos: {describeScope(pending.scope)}</li>
      </ul>
      <p>Solo lectura. Nunca veras ni compartiras tokens de Google con la aplicacion.</p>
      <form action={decide} style={{ display: "flex", gap: "0.75rem" }}>
        <input type="hidden" name="pending" value={id} />
        <button type="submit" name="decision" value="approve" style={button}>Aprobar</button>
        <button type="submit" name="decision" value="deny" style={buttonSecondary}>Cancelar</button>
      </form>
    </Shell>
  );
}
