import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/auth/session";
import { getModuleStatuses } from "../../lib/connection";
import { modules } from "../../lib/modules/registry";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  not_connected: "No conectado",
  authorized: "Autorizado (sin verificar)",
  connected: "Conectado",
  no_resources: "Sin recursos",
  scope_lost: "Permiso perdido",
  expired: "Sesion expirada",
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { module: justConnected } = await searchParams;
  const statuses = await getModuleStatuses(user.id, () => true);
  const known = new Set(modules.map((m) => m.id));

  return (
    <main>
      <h1>Modulos</h1>
      <p>Sesion: {user.email}</p>
      <form method="post" action="/logout">
        <button type="submit">Cerrar sesion</button>
      </form>
      {justConnected && known.has(justConnected as never) ? <p>Modulo {justConnected} verificado.</p> : null}
      <ul>
        {statuses.map((s) => (
          <li key={s.id}>
            <strong>{s.id}</strong>: {LABEL[s.status] ?? s.status}
            {s.resource_count !== null ? ` (${s.resource_count} recursos)` : ""}
            {s.last_probe_at ? ` - ultimo chequeo ${s.last_probe_at}` : ""}
            {s.last_error ? <div>{s.last_error}</div> : null}
            {s.status === "connected" ? null : (
              <div>
                <a href={s.connect_url}>{s.status === "not_connected" ? "Conectar" : "Reconectar"}</a>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
