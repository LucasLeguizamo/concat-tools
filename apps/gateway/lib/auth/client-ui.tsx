"use client";

import { useState, type ReactNode } from "react";
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

/** Comando de la CLI con boton de copiar; sin JS sigue siendo texto seleccionable. */
export function CopyCommand({ command, label, copy, copied }: { command: string; label: string; copy: string; copied: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="cmd">
      <code aria-label={label}>
        <span aria-hidden className="cmd__prompt">$ </span>
        {command}
      </code>
      <button
        type="button"
        className="cmd__copy"
        onClick={() => {
          void navigator.clipboard?.writeText(command).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
      >
        <span aria-live="polite">{done ? copied : copy}</span>
      </button>
    </div>
  );
}
