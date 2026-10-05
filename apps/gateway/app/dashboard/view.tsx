import { CopyCommand, SubmitButton } from "../../lib/auth/client-ui";
import { Brand, Footer, Identity, Notice } from "../../lib/auth/ui";
import type { ModuleStatusEntry } from "../../lib/connection";
import { moduleName, t, utcMinute } from "../../lib/copy";
import type { ModuleStatus } from "../../lib/modules/types";

/** Primero lo que pide accion (perdido > expirado > sin recursos > verificando), luego conectados, luego el resto. */
const URGENCY: Record<ModuleStatus, number> = {
  scope_lost: 0,
  expired: 1,
  no_resources: 2,
  authorized: 3,
  connected: 4,
  not_connected: 5,
};
const NEEDS_ACTION = new Set<ModuleStatus>(["scope_lost", "expired", "no_resources", "authorized"]);

export const byUrgency = (a: ModuleStatusEntry, b: ModuleStatusEntry) => URGENCY[a.status] - URGENCY[b.status];

export interface DashboardParams {
  module?: string;
  disconnected?: string;
  error?: string;
  failed?: string;
}

export type Banner = { tone: "ok" | "error" | "warn"; title?: string; body: string };

/**
 * Un solo aviso por carga. Un error manda sobre cualquier exito (antes un fallo al desconectar mostraba
 * "verificado" encima del error). Solo se nombran modulos conocidos.
 */
export function bannerFor(p: DashboardParams, statuses: ModuleStatusEntry[]): Banner | null {
  const known = (id?: string) => statuses.find((s) => s.id === id);
  if (p.error) {
    const failed = known(p.failed);
    return {
      tone: "error",
      body: p.error === "disconnect_failed" && failed ? t.dashboard.disconnectFailed(moduleName(failed.id)) : t.dashboard.unknownError,
    };
  }
  const connected = known(p.module);
  if (connected) {
    const name = moduleName(connected.id);
    if (connected.status === "connected") {
      const res = connected.resource_count !== null ? t.dashboard.resources(connected.resource_count) : null;
      return { tone: "ok", title: t.dashboard.connectedTitle(name), body: t.dashboard.connectedBody(res) };
    }
    return {
      tone: "warn",
      title: `${name}: ${t.status[connected.status]}`,
      body: connected.last_error ?? t.statusHint[connected.status] ?? "",
    };
  }
  const gone = known(p.disconnected);
  if (gone) return { tone: "ok", title: t.dashboard.disconnectedTitle(moduleName(gone.id)), body: "" };
  return null;
}

const TONE: Partial<Record<ModuleStatus, string>> = {
  connected: "ok",
  authorized: "wait",
  no_resources: "warn",
  scope_lost: "warn",
  expired: "warn",
};

function ModuleCard({ s, disconnect }: { s: ModuleStatusEntry; disconnect: (f: FormData) => Promise<void> }) {
  const name = moduleName(s.id);
  const hint = s.last_error ?? t.statusHint[s.status];
  const meta = [
    s.resource_count !== null ? t.dashboard.resources(s.resource_count) : null,
    s.last_probe_at ? `${t.dashboard.lastProbe} ${utcMinute(s.last_probe_at)}` : null,
  ].filter(Boolean);
  return (
    <li className="mod" data-status={s.status}>
      <div className="mod__top">
        <h3 className="mod__name">
          {/* eslint-disable-next-line @next/next/no-img-element -- svg local, sin optimizacion */}
          <img src={`/icons/${s.id}.svg`} alt="" width={20} height={20} className="mod__icon" />
          {name}
        </h3>
        {s.beta ? <span className="tag">beta</span> : <span className="mod__id">{s.id}</span>}
      </div>
      <p className="status" data-tone={TONE[s.status]}>
        {t.status[s.status]}
      </p>
      {meta.length ? <p className="mod__meta">{meta.join(" · ")}</p> : null}
      {hint ? <p className="mod__hint">{hint}</p> : null}
      {s.status === "connected" ? null : (
        <CopyCommand command={`concat connect ${s.id}`} label={t.dashboard.cliLabel} copy={t.dashboard.copy} copied={t.dashboard.copied} />
      )}
      <div className="mod__actions">
        {s.status === "connected" ? null : (
          <a href={s.connect_url} className={NEEDS_ACTION.has(s.status) ? "btn btn--sm btn--amber" : "btn btn--sm"}>
            {s.status === "not_connected" ? t.dashboard.connect : t.dashboard.reconnect}
          </a>
        )}
        {s.status === "not_connected" ? null : (
          <details className="danger">
            <summary>{t.dashboard.disconnect}</summary>
            <form action={disconnect} className="danger__panel">
              <p>{t.dashboard.disconnectWarning(name)}</p>
              <input type="hidden" name="module" value={s.id} />
              <SubmitButton className="btn btn--sm btn--red" pending={t.dashboard.disconnecting}>
                {t.dashboard.disconnectConfirm}
              </SubmitButton>
            </form>
          </details>
        )}
      </div>
    </li>
  );
}

export function DashboardView({
  email,
  statuses,
  params,
  disconnect,
}: {
  email: string;
  statuses: ModuleStatusEntry[];
  params: DashboardParams;
  disconnect: (f: FormData) => Promise<void>;
}) {
  const stable = statuses.filter((s) => !s.beta).sort(byUrgency);
  const betas = statuses.filter((s) => s.beta).sort(byUrgency);
  const count = (list: ModuleStatusEntry[]) => list.filter((s) => s.status === "connected").length;
  const attention = statuses.filter((s) => NEEDS_ACTION.has(s.status)).length;
  const banner = bannerFor(params, statuses);

  return (
    <main className="page">
      <Brand />
      <section className="win">
        <div className="win__bar">
          <i aria-hidden />
          <i aria-hidden />
          <i aria-hidden />
          <span>$ {t.dashboard.windowTitle}</span>
        </div>
        <div className="win__body">
          <header className="head">
            <div>
              <h1 className="title">{t.dashboard.title}</h1>
              <p className="counts">
                {t.dashboard.connectedCount(count(stable), stable.length)}
                {betas.length ? <> · {t.dashboard.betaCount(count(betas), betas.length)}</> : null}
              </p>
            </div>
            <div className="who">
              <Identity email={email} label={t.dashboard.signedInAs} />
              <form method="post" action="/logout">
                <button type="submit" className="link">
                  {t.dashboard.signOut}
                </button>
              </form>
            </div>
          </header>

          {banner ? (
            <Notice tone={banner.tone} title={banner.title}>
              {banner.body}
            </Notice>
          ) : attention > 0 ? (
            <Notice tone="warn">{t.dashboard.attention(attention)}</Notice>
          ) : null}

          <h2 className="section">{t.dashboard.available}</h2>
          <ul className="mods">
            {stable.map((s) => (
              <ModuleCard key={s.id} s={s} disconnect={disconnect} />
            ))}
          </ul>

          {betas.length ? (
            <>
              <h2 className="section">{t.dashboard.beta}</h2>
              <p className="section__note">
                {t.dashboard.betaNote} <a href={t.modulesDocsUrl}>{t.dashboard.betaHowTo}</a>
              </p>
              <ul className="mods">
                {betas.map((s) => (
                  <ModuleCard key={s.id} s={s} disconnect={disconnect} />
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </section>
      <Footer />
    </main>
  );
}
