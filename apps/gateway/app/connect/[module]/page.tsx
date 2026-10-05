import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "../../../lib/auth/session";
import { button, Shell } from "../../../lib/auth/ui";
import { getModule } from "../../../lib/modules/registry";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  denied: "Cancelaste el permiso en Google.",
  scopes_missing: "Desmarcaste el permiso de este modulo en Google. Vuelve a conectar y deja la casilla marcada.",
  account_mismatch: "Elegiste otra cuenta de Google. Usa la misma cuenta con la que iniciaste sesion.",
  session: "Tu sesion cambio durante el proceso. Intenta de nuevo.",
  google: "Google rechazo la solicitud. Intenta de nuevo.",
  state: "La solicitud expiro. Intenta de nuevo.",
};

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

  if (!(await getSessionUser())) redirect(`/login?next=${encodeURIComponent(`/connect/${mod.id}`)}`);

  return (
    <Shell title={`Conectar ${mod.id}`}>
      {error && <p role="alert" className="alert">{ERRORS[error] ?? "No se pudo conectar el modulo."}</p>}
      {mod.beta && (
        <p role="note" className="note">
          <strong>Modulo en beta cerrada.</strong> Funciona solo para las cuentas de la lista de prueba de Google
          mientras se completa la verificacion de la app; el acceso puede caducar a los 7 dias.
        </p>
      )}
      <p>Vas a dar acceso de <strong>solo lectura</strong> a este modulo:</p>
      <ul>
        {mod.scopes.read.map((s) => (
          <li key={s}><code>{s}</code></li>
        ))}
      </ul>
      <p><strong>Permiso extra necesario:</strong> {mod.extraPermission}</p>
      <p>Solo se marca como conectado cuando una consulta real devuelve datos.</p>
      <a href={`/google/start?module=${encodeURIComponent(mod.id)}`} className={button}>
        Conectar con Google
      </a>
    </Shell>
  );
}
