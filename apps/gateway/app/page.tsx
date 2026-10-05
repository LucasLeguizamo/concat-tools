import { CopyCommand } from "../lib/auth/client-ui";
import { Shell } from "../lib/auth/ui";
import { t } from "../lib/copy";

export default function Home() {
  return (
    <Shell title={t.home.title}>
      <p className="dim">{t.home.body}</p>
      <h2 className="section">{t.home.start}</h2>
      <CopyCommand
        command="npx -y @lucasleguizamo/concat login"
        label={t.dashboard.cliLabel}
        copy={t.dashboard.copy}
        copied={t.dashboard.copied}
        fallback={t.dashboard.copyFallback}
      />
      <div className="actions">
        <a href="/dashboard" className="btn">
          {t.home.dashboard}
        </a>
      </div>
    </Shell>
  );
}
