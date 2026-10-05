import type { ReactNode } from "react";
import { AutoRefresh, CleanUrl, CloseDetails, CopyCommand, SubmitButton } from "../../lib/auth/client-ui";
import { Brand, Done, Footer, Identity, Notice } from "../../lib/auth/ui";
import type { ModuleStatusEntry } from "../../lib/connection";
import { es, moduleName, utcMinute, type Copy } from "../../lib/copy";
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
/** Piden algo al usuario. "Verificando" no: espera sola (auto-refresh) y no infla el conteo de atencion. */
const NEEDS_ACTION = new Set<ModuleStatus>(["scope_lost", "expired", "no_resources"]);
/** Se arreglan reconectando (OAuth). "Sin recursos" y "verificando" NO: reconectar solo repetiria el mismo estado. */
const NEEDS_RECONNECT = new Set<ModuleStatus>(["scope_lost", "expired"]);

/**
 * Explicacion localizada del estado. `last_error` viene del servidor en espanol y con detalle (p. ej. que
 * propiedad falta): se usa en ES; en otro idioma se usa la pista generica + el requisito del modulo.
 */
export function hintFor(s: ModuleStatusEntry, t: Copy): string | null {
  const local =
    s.status === "no_resources"
      ? `${t.statusHint.no_resources} ${(t.requirement as Record<string, string>)[s.id] ?? ""}`.trim()
      : t.statusHint[s.status];
  return (t.lang === "es" ? s.last_error : null) ?? local;
}

export const byUrgency = (a: ModuleStatusEntry, b: ModuleStatusEntry) => URGENCY[a.status] - URGENCY[b.status];

export interface DashboardParams {
  module?: string;
  checked?: string;
  disconnected?: string;
  error?: string;
  failed?: string;
}
const ONE_SHOT_PARAMS = ["module", "checked", "disconnected", "error", "failed"];

export type Banner = { tone: "ok" | "error" | "warn"; title?: string; body: string; done?: boolean };

/**
 * Un solo aviso por carga. Un error manda sobre cualquier exito (antes un fallo al desconectar mostraba
 * "verificado" encima del error). Solo se nombran modulos conocidos; nunca se repite el parametro.
 */
export function bannerFor(p: DashboardParams, statuses: ModuleStatusEntry[], t: Copy = es): Banner | null {
  const known = (id?: string) => statuses.find((s) => s.id === id);
  if (p.error) {
    const failed = known(p.failed);
    const name = failed ? moduleName(t, failed.id) : null;
    const body =
      name && p.error === "disconnect_failed"
        ? t.dashboard.disconnectFailed(name)
        : name && p.error === "recheck_failed"
          ? t.dashboard.recheckFailed(name)
          : name && p.error === "rate_limited"
            ? t.dashboard.rateLimited(name)
            : t.dashboard.unknownError;
    return { tone: "error", body };
  }
  const returned = known(p.module) ?? known(p.checked);
  if (returned) {
    const name = moduleName(t, returned.id);
    if (returned.status === "connected") {
      const res = returned.resource_count !== null ? t.dashboard.resources(returned.resource_count) : null;
      return { tone: "ok", title: t.dashboard.connectedTitle(name), body: t.dashboard.connectedBody(res), done: true };
    }
    if (returned.status === "not_connected") {
      return { tone: "warn", title: t.dashboard.notCompletedTitle(name), body: t.dashboard.notCompletedBody };
    }
    return {
      tone: "warn",
      title: t.dashboard.checkedTitle(name, t.status[returned.status]),
      body: hintFor(returned, t) ?? "",
    };
  }
  const gone = known(p.disconnected);
  if (gone) return { tone: "ok", title: t.dashboard.disconnectedTitle(moduleName(t, gone.id)), body: "" };
  return null;
}

const TONE: Partial<Record<ModuleStatus, string>> = {
  connected: "ok",
  authorized: "wait",
  no_resources: "warn",
  scope_lost: "warn",
  expired: "warn",
};

type Actions = { disconnect: (f: FormData) => Promise<void>; recheck: (f: FormData) => Promise<void> };

function ModuleIcon({ id }: { id: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- svg local, sin optimizacion
  return <img src={`/icons/${id}.svg`} alt="" width={20} height={20} className="mod__icon" />;
}

const copyProps = (t: Copy) => ({ label: t.dashboard.cliLabel, copy: t.dashboard.copy, copied: t.dashboard.copied, fallback: t.dashboard.copyFallback });

/** Tarjeta para modulos con estado (conectados o que piden accion): una sola accion principal segun el estado. */
function ModuleCard({ s, actions, t }: { s: ModuleStatusEntry; actions: Actions; t: Copy }) {
  const name = moduleName(t, s.id);
  const hint = hintFor(s, t);
  const meta = [
    s.resource_count !== null ? t.dashboard.resources(s.resource_count) : null,
    s.last_probe_at ? `${t.dashboard.lastProbe} ${utcMinute(t, s.last_probe_at)}` : null,
  ].filter(Boolean);
  return (
    <li className="mod" data-status={s.status}>
      <div className="mod__top">
        <h3 className="mod__name">
          <ModuleIcon id={s.id} />
          {name}
        </h3>
        {s.beta ? <span className="tag">beta</span> : <span className="mod__id">{s.id}</span>}
      </div>
      <p className="status" data-tone={TONE[s.status]}>
        {t.status[s.status]}
      </p>
      {meta.length ? <p className="mod__meta">{meta.join(" · ")}</p> : null}
      {hint ? <p className="mod__hint">{hint}</p> : null}
      {NEEDS_RECONNECT.has(s.status) ? <CopyCommand command={`concat connect ${s.id}`} {...copyProps(t)} /> : null}
      {s.status === "connected" ? null : (
        <div className="mod__actions">
          {NEEDS_RECONNECT.has(s.status) ? (
            <a href={s.connect_url} className="btn btn--sm btn--amber">
              {t.dashboard.reconnect}
            </a>
          ) : (
            <form action={actions.recheck}>
              <input type="hidden" name="module" value={s.id} />
              <SubmitButton className="btn btn--sm btn--amber" pending={t.dashboard.rechecking}>
                {t.dashboard.recheck}
              </SubmitButton>
            </form>
          )}
          {s.status === "no_resources" ? (
            <a href={s.connect_url} className="mod__link">
              {t.dashboard.otherAccount}
            </a>
          ) : null}
        </div>
      )}
      <details className="danger">
        <summary>{t.dashboard.disconnect}</summary>
        <form action={actions.disconnect} className="danger__panel">
          <p>{t.dashboard.disconnectWarning(name)}</p>
          <input type="hidden" name="module" value={s.id} />
          <div className="danger__actions">
            <SubmitButton className="btn btn--sm btn--red" pending={t.dashboard.disconnecting}>
              {t.dashboard.disconnectConfirm}
            </SubmitButton>
            <CloseDetails className="btn btn--sm">{t.dashboard.keep}</CloseDetails>
          </div>
        </form>
      </details>
    </li>
  );
}

/** Fila compacta para modulos sin conectar: no compiten con los que piden accion. */
function ModuleRow({ s, t }: { s: ModuleStatusEntry; t: Copy }) {
  return (
    <li className="row">
      <span className="row__name">
        <ModuleIcon id={s.id} />
        {moduleName(t, s.id)}
        {s.beta ? <span className="tag">beta</span> : null}
      </span>
      <CopyCommand command={`concat connect ${s.id}`} {...copyProps(t)} />
      <a href={s.connect_url} className="btn btn--sm">
        {t.dashboard.connect}
      </a>
    </li>
  );
}

function ModuleSection({ title, note, list, actions, t }: { title: string; note?: ReactNode; list: ModuleStatusEntry[]; actions: Actions; t: Copy }) {
  const active = list.filter((s) => s.status !== "not_connected");
  const idle = list.filter((s) => s.status === "not_connected");
  return (
    <section>
      <h2 className="section">{title}</h2>
      {note ? <p className="section__note">{note}</p> : null}
      {active.length ? (
        <ul className="mods">
          {active.map((s) => (
            <ModuleCard key={s.id} s={s} actions={actions} t={t} />
          ))}
        </ul>
      ) : null}
      {idle.length ? (
        <ul className="rows" aria-label={t.dashboard.notConnected}>
          {idle.map((s) => (
            <ModuleRow key={s.id} s={s} t={t} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function DashboardView({
  email,
  statuses,
  params,
  disconnect,
  recheck,
  t,
}: {
  email: string;
  statuses: ModuleStatusEntry[];
  params: DashboardParams;
  t: Copy;
} & Actions) {
  const actions = { disconnect, recheck };
  const stable = statuses.filter((s) => !s.beta).sort(byUrgency);
  const betas = statuses.filter((s) => s.beta).sort(byUrgency);
  const count = (list: ModuleStatusEntry[]) => list.filter((s) => s.status === "connected").length;
  const attention = statuses.filter((s) => NEEDS_ACTION.has(s.status));
  const reconnectIds = attention.filter((s) => NEEDS_RECONNECT.has(s.status)).map((s) => s.id);
  /** Pendientes aparte del modulo del que habla el aviso. */
  const others = attention.filter((s) => s.id !== params.module && s.id !== params.checked && s.id !== params.failed).length;
  const banner = bannerFor(params, statuses, t);
  const verifying = statuses.some((s) => s.status === "authorized");

  return (
    <main className="page">
      <CleanUrl keys={ONE_SHOT_PARAMS} />
      {verifying ? <AutoRefresh seconds={10} times={6} /> : null}
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

          {banner?.done ? (
            <Done title={banner.title ?? ""} body={banner.body} hint={t.dashboard.doneHint} />
          ) : banner ? (
            <Notice tone={banner.tone} title={banner.title}>
              {banner.body}
            </Notice>
          ) : null}

          {/* Nunca dos avisos con borde seguidos: con un aviso arriba, la atencion pendiente es una linea discreta. */}
          {banner ? (
            others > 0 ? <p className="also">{t.dashboard.alsoAttention(others)}</p> : null
          ) : attention.length > 0 ? (
            <Notice tone="warn">
              {t.dashboard.attention(attention.length)}
              {reconnectIds.length > 1 ? (
                <span className="notice__cmd">
                  {t.dashboard.attentionCmd}
                  <CopyCommand command={`concat connect ${reconnectIds.join(" ")}`} {...copyProps(t)} />
                </span>
              ) : null}
            </Notice>
          ) : null}

          <ModuleSection title={t.dashboard.available} list={stable} actions={actions} t={t} />
          {betas.length ? (
            <ModuleSection
              title={t.dashboard.beta}
              note={
                <>
                  {t.dashboard.betaNote} <a href={t.modulesDocsUrl}>{t.dashboard.betaHowTo}</a>
                </>
              }
              list={betas}
              actions={actions}
              t={t}
            />
          ) : null}
        </div>
      </section>
      <Footer />
    </main>
  );
}
