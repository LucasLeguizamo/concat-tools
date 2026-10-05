import { redirect } from "next/navigation";
import { safeNext } from "../../lib/auth/http";
import { getSessionUser } from "../../lib/auth/session";
import { button, Notice, Shell } from "../../lib/auth/ui";
import { getT } from "../../lib/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getT()).login.title };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const target = safeNext(next);
  if (await getSessionUser()) redirect(target);
  const t = await getT();

  return (
    <Shell title={t.login.title} cmd={target.startsWith("/oauth/consent") ? undefined : "concat login"}>
      {error ? (
        <Notice tone={error === "denied" ? "warn" : "error"}>{t.login.errors[error] ?? t.login.genericError}</Notice>
      ) : null}
      {target.startsWith("/oauth/consent") ? <p className="lede">{t.login.fromApp}</p> : null}
      <p>{t.login.body}</p>
      <div className="actions">
        <a href={`/google/start?next=${encodeURIComponent(target)}`} className={button}>
          {t.login.cta}
        </a>
      </div>
    </Shell>
  );
}
