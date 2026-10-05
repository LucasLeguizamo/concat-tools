import { CopyCommand } from "../lib/auth/client-ui";
import { Shell } from "../lib/auth/ui";
import { getT } from "../lib/i18n";

export default async function NotFound() {
  const t = await getT();
  return (
    <Shell title={t.notFound.title}>
      <p>{t.notFound.body}</p>
      <CopyCommand command="concat status" label={t.dashboard.cliLabel} copy={t.dashboard.copy} copied={t.dashboard.copied} fallback={t.dashboard.copyFallback} />
      <div className="actions">
        <a href="/dashboard" className="btn">
          {t.home.dashboard}
        </a>
      </div>
    </Shell>
  );
}
