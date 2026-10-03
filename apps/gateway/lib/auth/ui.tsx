import type { CSSProperties, ReactNode } from "react";

export const button: CSSProperties = {
  display: "inline-block",
  padding: "0.6rem 1.1rem",
  border: "1px solid #111",
  borderRadius: 6,
  background: "#111",
  color: "#fff",
  font: "inherit",
  cursor: "pointer",
  textDecoration: "none",
};

export const buttonSecondary: CSSProperties = { ...button, background: "#fff", color: "#111" };

export function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: "34rem", margin: "4rem auto", padding: "0 1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.4rem" }}>{title}</h1>
      {children}
    </main>
  );
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `*` -> texto legible; ids de modulo tal cual. */
export const describeScope = (scope: string) =>
  scope.trim() === "*" ? "Todos los modulos que conectes (solo lectura)" : `Modulos: ${scope} (solo lectura)`;
