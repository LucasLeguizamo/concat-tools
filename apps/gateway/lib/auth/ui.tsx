import type { ReactNode } from "react";

/** Clases de boton (app/globals.css). */
export const button = "btn btn--primary";
export const buttonSecondary = "btn";

export function Brand() {
  return (
    <a href="/dashboard" className="brand">
      <span className="brand__mark" aria-hidden />
      CONCAT <small>google gateway</small>
    </a>
  );
}

/** Ventana de terminal centrada para los pasos de auth. */
export function Shell({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <main className={wide ? "page" : "page page--narrow"}>
      <Brand />
      <section className="win">
        <div className="win__bar" aria-hidden>
          <i />
          <i />
          <i />
          <span>gw.onconcat.com</span>
        </div>
        <div className="win__body">
          <h1 className="title">{title}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `*` -> texto legible; ids de modulo tal cual. */
export const describeScope = (scope: string) =>
  scope.trim() === "*" ? "Todos los modulos que conectes (solo lectura)" : `Modulos: ${scope} (solo lectura)`;

/** Cierra la sesion del gateway y vuelve a `next` tras elegir otra cuenta de Google. */
export function SwitchAccount({ email, next }: { email: string; next: string }) {
  return (
    <form method="post" action="/logout" style={{ marginTop: "1.5rem" }} className="dim">
      <input type="hidden" name="next" value={next} />
      <small>
        ¿No es {email}?{" "}
        <button type="submit" className="link">
          Usar otra cuenta
        </button>
      </small>
    </form>
  );
}
