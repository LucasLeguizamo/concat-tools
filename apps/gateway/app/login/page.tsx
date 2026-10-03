import { redirect } from "next/navigation";
import { safeNext } from "../../lib/auth/http";
import { getSessionUser } from "../../lib/auth/session";
import { button, Shell } from "../../lib/auth/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  state: "La sesion de login expiro o no coincide. Intenta de nuevo.",
  denied: "Cancelaste el acceso en Google.",
  google: "Google rechazo la solicitud. Intenta de nuevo.",
  no_refresh: "Google no entrego permiso offline. Revoca el acceso de CONCAT en tu cuenta de Google e intenta de nuevo.",
  session: "Tu sesion cambio durante el proceso. Inicia sesion de nuevo.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const target = safeNext(next);
  if (await getSessionUser()) redirect(target);

  return (
    <Shell title="Iniciar sesion">
      {error && <p role="alert">{ERRORS[error] ?? "No se pudo iniciar sesion."}</p>}
      <p>
        Entra con Google. Solo pedimos tu identidad (correo y perfil); cada servicio pide su propio permiso de solo
        lectura cuando lo conectas.
      </p>
      <a href={`/google/start?next=${encodeURIComponent(target)}`} style={button}>
        Continuar con Google
      </a>
    </Shell>
  );
}
