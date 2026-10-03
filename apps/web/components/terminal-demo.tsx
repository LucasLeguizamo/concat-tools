"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { TermLine } from "@/dictionaries/types";
import { TermLines, TermWindow } from "./term-lines";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

// Un "paso" es un caracter tecleado o la aparicion de una linea de salida.
// Cada comando cuesta len + 1 pasos (el ultimo es el Enter).
function locate(lines: TermLine[], step: number) {
  let rest = step;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const cost = line.kind === "cmd" ? line.text.length + 1 : 1;
    if (rest < cost) return { index, line, rest };
    rest -= cost;
  }
  return null;
}

export function TerminalDemo({ lines, title, label }: { lines: TermLine[]; title: string; label: string }) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const where = reduced ? null : locate(lines, step);

  useEffect(() => {
    if (!where) return;
    const { line, rest } = where;
    const delay = line.kind !== "cmd" ? 230 : rest === line.text.length ? 420 : rest === 0 ? 260 : 34;
    const id = window.setTimeout(() => setStep((s) => s + 1), delay);
    return () => window.clearTimeout(id);
  }, [where]);

  const shown = where ? lines.slice(0, where.index) : lines;
  const typing = where && where.line.kind === "cmd" ? where.line.text.slice(0, where.rest) : null;

  return (
    <TermWindow title={title}>
      {/* Transcripcion completa para lectores de pantalla; lo animado va oculto. */}
      <p className="sr-only">
        {label}: {lines.map((l) => l.text).join(" / ")}
      </p>
      <div className="term" aria-hidden="true">
        {/* Capa invisible con el contenido final: fija la altura y evita saltos de layout. */}
        <div className="term__ghost">
          <TermLines lines={lines} />
          <div className="tl">$ </div>
        </div>
        <div className="term__live">
          <TermLines lines={shown} />
          <div className="tl tl--cmd">
            <span className="tl__prompt">$ </span>
            {typing}
            <span className="cursor" />
          </div>
        </div>
      </div>
    </TermWindow>
  );
}
