import { redirect } from "next/navigation";
import { safeNext } from "../../lib/auth/http";
import { getSessionUser } from "../../lib/auth/session";
import { button, Notice, Shell } from "../../lib/auth/ui";
import { t } from "../../lib/copy";

export const dynamic = "force-dynamic";
export const metadata = { title: t.login.title };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const target = safeNext(next);
  if (await getSessionUser()) redirect(target);

  return (
    <Shell title={t.login.title} cmd="concat login">
      {error ? <Notice tone="error">{t.login.errors[error] ?? t.login.genericError}</Notice> : null}
      <p>{t.login.body}</p>
      <div className="actions">
        <a href={`/google/start?next=${encodeURIComponent(target)}`} className={button}>
          {t.login.cta}
        </a>
      </div>
    </Shell>
  );
}
