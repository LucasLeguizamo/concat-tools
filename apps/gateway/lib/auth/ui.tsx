import type { ReactNode } from "react";
import { t } from "../copy";

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

/**
 * Ventana de terminal centrada para los pasos de auth. `cmd` es el comando de la CLI que trajo al usuario
 * aqui (barra de la ventana): la pagina se lee como la continuacion de su terminal.
 */
export function Shell({ title, cmd, children, wide }: { title: string; cmd?: string; children: ReactNode; wide?: boolean }) {
  return (
    <main className={wide ? "page" : "page page--narrow"}>
      <Brand />
      <section className="win">
        <div className="win__bar">
          <i aria-hidden />
          <i aria-hidden />
          <i aria-hidden />
          <span>{cmd ? `$ ${cmd}` : "gw.onconcat.com"}</span>
        </div>
        <div className="win__body">
          <h1 className="title">{title}</h1>
          {children}
        </div>
      </section>
      <Footer />
    </main>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <a href={t.docsUrl}>{t.help}</a>
      <span aria-hidden>·</span>
      <a href="https://onconcat.com">onconcat.com</a>
    </footer>
  );
}

/** Cuenta activa, siempre visible antes de aprobar o conectar (PRODUCT.md, principio 1). */
export function Identity({ email, label }: { email: string; label: string }) {
  return (
    <p className="identity">
      <span className="identity__label">{label}</span>
      <strong className="identity__email">{email}</strong>
    </p>
  );
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `*` -> texto legible; ids de modulo tal cual. */
export const describeScope = (scope: string) => t.scope(scope);

/** Cierra la sesion del gateway y vuelve a `next` tras elegir otra cuenta de Google. */
export function SwitchAccount({ email, next }: { email: string; next: string }) {
  return (
    <form method="post" action="/logout" className="switch">
      <input type="hidden" name="next" value={next} />
      {t.switchAccount.notYou(email)}{" "}
      <button type="submit" className="link">
        {t.switchAccount.cta}
      </button>
    </form>
  );
}

/** Aviso de estado con prefijo de log (`[ok]`, `[error]`, `[!]`), sin franja lateral. */
export function Notice({ tone, title, children }: { tone: "ok" | "error" | "warn"; title?: string; children: ReactNode }) {
  const tag = (
    <span className="notice__tag" aria-hidden>
      {tone === "ok" ? "ok" : tone === "error" ? "error" : "!"}
    </span>
  );
  return (
    <div className="notice" data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      {title ? (
        <>
          <p className="notice__title">
            {tag}
            <strong>{title}</strong>
          </p>
          {children ? <p>{children}</p> : null}
        </>
      ) : (
        <p>
          {tag}
          {children}
        </p>
      )}
    </div>
  );
}
