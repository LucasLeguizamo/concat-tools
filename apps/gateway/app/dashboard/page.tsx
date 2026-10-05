import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/auth/session";
import { Brand } from "../../lib/auth/ui";
import { getModuleStatuses, type ModuleStatusEntry } from "../../lib/connection";
import { modules } from "../../lib/modules/registry";
import { disconnectAction } from "./actions";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  not_connected: "No conectado",
  authorized: "Autorizado (sin verificar)",
  connected: "Conectado",
  no_resources: "Sin recursos",
  scope_lost: "Permiso perdido",
  expired: "Sesion expirada",
};

const TONE: Record<string, string> = {
  connected: "ok",
  authorized: "warn",
  no_resources: "warn",
  scope_lost: "warn",
  expired: "warn",
};

const NAME: Record<string, string> = {
  gsc: "Search Console",
  ga4: "Analytics 4",
  ads: "Google Ads",
  people: "Contactos",
  calendar: "Calendar",
  docs: "Docs",
  sheets: "Sheets",
  slides: "Slides",
  gmail: "Gmail",
  drive: "Drive",
  chat: "Chat",
};

/** Logo por modulo en public/icons/<id>.svg (svgl.app; gsc, ads, docs y people de Wikimedia Commons). */
const iconOf = (id: string) => `/icons/${id}.svg`;

function ModuleCard({ s, beta }: { s: ModuleStatusEntry; beta: boolean }) {
  return (
    <li className="mod" data-status={s.status}>
      <div className="mod__top">
        <span className="mod__name">
          {/* eslint-disable-next-line @next/next/no-img-element -- svg local, sin optimizacion */}
          <img src={iconOf(s.id)} alt="" width={20} height={20} className="mod__icon" />
          {NAME[s.id] ?? s.id}
        </span>
        {beta ? <span className="tag">beta</span> : <span className="mod__id">{s.id}</span>}
      </div>
      <span className="status" data-tone={TONE[s.status]}>
        {LABEL[s.status] ?? s.status}
        {s.resource_count !== null ? ` · ${s.resource_count} recursos` : ""}
      </span>
      {s.last_probe_at ? (
        <span className="mod__meta">
          chequeo <time dateTime={s.last_probe_at}>{s.last_probe_at.replace("T", " ").slice(0, 16)}</time>
        </span>
      ) : null}
      {s.last_error ? <span className="mod__err">{s.last_error}</span> : null}
      <div className="mod__actions">
        {s.status === "connected" ? null : (
          <a href={s.connect_url} className={s.status === "not_connected" ? "btn btn--sm" : "btn btn--sm btn--primary"}>
            {s.status === "not_connected" ? "Conectar" : "Reconectar"}
          </a>
        )}
        {s.status === "not_connected" ? null : (
          <form action={disconnectAction}>
            <input type="hidden" name="module" value={s.id} />
            <button type="submit" className="btn btn--sm btn--danger">
              Desconectar
            </button>
          </form>
        )}
      </div>
    </li>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ module?: string; disconnected?: string; error?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { module: justConnected, disconnected, error } = await searchParams;
  const statuses = await getModuleStatuses(user.id, () => true);
  const known = new Set(modules.map((m) => m.id));
  const beta = new Set(modules.filter((m) => m.beta).map((m) => m.id));
  const stable = statuses.filter((s) => !beta.has(s.id));
  const betas = statuses.filter((s) => beta.has(s.id));
  const connected = statuses.filter((s) => s.status === "connected").length;

  return (
    <main className="page">
      <Brand />
      <section className="win">
        <div className="win__bar" aria-hidden>
          <i />
          <i />
          <i />
          <span>concat status</span>
        </div>
        <div className="win__body">
          <div className="head">
            <h1 className="title">Modulos</h1>
            <div className="who">
              <span>
                {user.email} · {connected}/{statuses.length} conectados
              </span>
              <form method="post" action="/logout">
                <button type="submit" className="btn btn--sm">
                  Cerrar sesion
                </button>
              </form>
            </div>
          </div>
          {justConnected && known.has(justConnected as never) ? <p className="ok">Modulo {justConnected} verificado.</p> : null}
          {disconnected && known.has(disconnected as never) ? <p className="ok">Modulo {disconnected} desconectado.</p> : null}
          {error ? <p role="alert" className="alert">No se pudo desconectar el modulo. Reintenta en unos instantes.</p> : null}

          <h2 className="section">Disponibles</h2>
          <ul className="mods">
            {stable.map((s) => (
              <ModuleCard key={s.id} s={s} beta={false} />
            ))}
          </ul>

          {betas.length > 0 ? (
            <>
              <h2 className="section">Beta cerrada · Google Workspace</h2>
              <p className="dim" style={{ marginTop: 0 }}>
                Solo para cuentas en la lista de prueba mientras Google verifica la app.
              </p>
              <ul className="mods">
                {betas.map((s) => (
                  <ModuleCard key={s.id} s={s} beta />
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
