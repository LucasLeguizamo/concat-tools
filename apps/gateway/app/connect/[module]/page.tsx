import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "../../../lib/auth/session";
import { button, buttonSecondary, Identity, Notice, Shell, SwitchAccount } from "../../../lib/auth/ui";
import { moduleName } from "../../../lib/copy";
import { getT } from "../../../lib/i18n";
import { getModule } from "../../../lib/modules/registry";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  const [mod, t] = [getModule((await params).module), await getT()];
  return { title: mod ? t.connect.title(moduleName(t, mod.id)) : t.connect.genericError };
}

export default async function ConnectPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { module: id } = await params;
  const { error } = await searchParams;
  const mod = getModule(id);
  if (!mod) notFound();

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/connect/${mod.id}`)}`);
  const t = await getT();
  const name = moduleName(t, mod.id);

  return (
    <Shell title={t.connect.title(name)} cmd={`concat connect ${mod.id}`}>
      {error ? (
        <Notice tone={error === "denied" ? "warn" : "error"}>{t.connect.errors[error] ?? t.connect.genericError}</Notice>
      ) : null}
      {mod.beta ? (
        <Notice tone="warn" title={t.connect.betaTitle}>
          {t.connect.betaBody}
        </Notice>
      ) : null}
      <Identity email={user.email} label={t.connect.as} />
      <p>{t.connect.intro(name)}</p>
      <ul className="scopes">
        {mod.scopes.read.map((s) => (
          <li key={s}>
            <code>{s}</code>
          </li>
        ))}
      </ul>
      <p>
        <strong>{t.connect.extra}:</strong> {t.requirement[mod.id]}
      </p>
      <p className="dim">{t.connect.verifyNote}</p>
      <div className="actions">
        <a href={`/google/start?module=${encodeURIComponent(mod.id)}`} className={button}>
          {t.connect.cta}
        </a>
        <a href="/dashboard" className={buttonSecondary}>
          {t.connect.back}
        </a>
      </div>
      <SwitchAccount email={user.email} next={`/connect/${mod.id}`} />
    </Shell>
  );
}
