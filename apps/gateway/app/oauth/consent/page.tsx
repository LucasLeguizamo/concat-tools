import { redirect } from "next/navigation";
import { resolveClientForRedirect } from "../../../lib/auth/clients";
import { redirectWithParams } from "../../../lib/auth/http";
import { oauthServer } from "../../../lib/auth/oauth-server";
import { getSessionUser } from "../../../lib/auth/session";
import { CopyCommand, SubmitButton } from "../../../lib/auth/client-ui";
import { button, buttonSecondary, Identity, Shell, SwitchAccount, UUID_RE } from "../../../lib/auth/ui";
import { scopeAllows } from "../../../lib/bearer";
import { getModuleStatuses } from "../../../lib/connection";
import { moduleName } from "../../../lib/copy";
import { getT } from "../../../lib/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getT()).consent.title };
}

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
  const t = await getT();

  const pending = UUID_RE.test(id) ? await oauthServer().getPending(id) : null;
  if (!pending) {
    return (
      <Shell title={t.consent.expiredTitle}>
        <p>{t.consent.expiredBody}</p>
        <CopyCommand command="concat login" label={t.dashboard.cliLabel} copy={t.dashboard.copy} copied={t.dashboard.copied} fallback={t.dashboard.copyFallback} />
        <div className="actions">
          <a href="/dashboard" className={buttonSecondary}>
            {t.home.dashboard}
          </a>
        </div>
      </Shell>
    );
  }

  let clientName: string;
  try {
    clientName = (await resolveClientForRedirect(pending.clientId, pending.redirectUri)).name;
  } catch {
    return (
      <Shell title={t.consent.invalidTitle}>
        <p>{t.consent.invalidBody}</p>
        <div className="actions">
          <a href="/dashboard" className={buttonSecondary}>
            {t.home.dashboard}
          </a>
        </div>
      </Shell>
    );
  }
  const redirectHost = new URL(pending.redirectUri).host;
  // Que significa el scope HOY: los modulos ya conectados que la aplicacion podra leer.
  const scope = pending.scope.split(/[\s,]+/).filter(Boolean);
  const reachable = (await getModuleStatuses(user.id, (m) => scopeAllows(scope, m)).catch(() => []))
    .filter((m) => m.status === "connected")
    .map((m) => moduleName(t, m.id));

  return (
    <Shell title={t.consent.title}>
      <p className="lede">
        <strong>{clientName}</strong> {t.consent.wants}:
      </p>
      <Identity email={user.email} label={t.dashboard.signedInAs} />
      <dl className="facts">
        <dt>{t.consent.client}</dt>
        <dd>
          <code>{pending.clientId}</code>
        </dd>
        <dt>{t.consent.returnsTo}</dt>
        <dd>
          <code>{redirectHost}</code>
        </dd>
        <dt>{t.consent.scope}</dt>
        <dd>
          {t.scope(pending.scope)}
          <span className="facts__sub">
            {reachable.length ? t.consent.today(reachable.join(", ")) : t.consent.todayNone}
          </span>
        </dd>
      </dl>
      <p className="dim">{t.consent.readOnly}</p>
      <form action={decide} className="actions">
        <input type="hidden" name="pending" value={id} />
        <SubmitButton className={button} name="decision" value="approve" pending={t.consent.approving}>
          {t.consent.approve}
        </SubmitButton>
        <SubmitButton className={buttonSecondary} name="decision" value="deny" pending={t.consent.denying}>
          {t.consent.deny}
        </SubmitButton>
      </form>
      <SwitchAccount email={user.email} next={`/oauth/consent?pending=${id}`} />
    </Shell>
  );
}
