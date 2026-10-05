"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Boton de envio que se deshabilita y cambia de texto mientras la accion del servidor corre (evita doble envio). */
export function SubmitButton({
  children,
  pending,
  className,
  name,
  value,
}: {
  children: ReactNode;
  pending: string;
  className: string;
  name?: string;
  value?: string;
}) {
  const status = useFormStatus();
  const busy = status.pending && (name === undefined || status.data?.get(name) === value);
  return (
    <button type="submit" className={className} name={name} value={value} disabled={status.pending} aria-busy={busy}>
      {busy ? pending : children}
    </button>
  );
}

/**
 * Comando de la CLI con boton de copiar; sin JS sigue siendo texto seleccionable. Si el portapapeles no esta
 * disponible (contexto no seguro), selecciona el texto y lo dice.
 */
export function CopyCommand({
  command,
  label,
  copy,
  copied,
  fallback,
}: {
  command: string;
  label: string;
  copy: string;
  copied: string;
  fallback: string;
}) {
  const [state, setState] = useState<"idle" | "done" | "manual">("idle");
  const ref = useRef<HTMLElement>(null);
  const selectText = () => {
    const sel = window.getSelection();
    if (!sel || !ref.current) return;
    sel.selectAllChildren(ref.current);
  };
  return (
    <div className="cmd">
      <span className="sr-only">{label}: </span>
      <code ref={ref}>
        <span aria-hidden className="cmd__prompt">
          ${" "}
        </span>
        {command}
      </code>
      <button
        type="button"
        className="cmd__copy"
        onClick={() => {
          const done = () => {
            setState("done");
            setTimeout(() => setState("idle"), 1500);
          };
          const manual = () => {
            selectText();
            setState("manual");
          };
          if (!navigator.clipboard) return manual();
          navigator.clipboard.writeText(command).then(done, manual);
        }}
      >
        <span aria-live="polite">{state === "done" ? copied : state === "manual" ? fallback : copy}</span>
      </button>
    </div>
  );
}

/** Boton "Mantener" dentro de un <details>: lo cierra (cancelar explicito, PRODUCT.md principio 4). */
export function CloseDetails({ children, className }: { children: ReactNode; className: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        const d = e.currentTarget.closest("details");
        if (d) {
          d.open = false;
          d.querySelector("summary")?.focus();
        }
      }}
    >
      {children}
    </button>
  );
}

/** Quita los parametros de un solo uso (?module=, ?error=) para que recargar no repita un aviso viejo. */
export function CleanUrl({ keys }: { keys: string[] }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!keys.some((k) => url.searchParams.has(k))) return;
    for (const k of keys) url.searchParams.delete(k);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [keys]);
  return null;
}
