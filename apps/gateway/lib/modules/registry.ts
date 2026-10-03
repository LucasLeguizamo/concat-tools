import { adsModule } from "./ads";
import { ga4Module } from "./ga4";
import { gscModule } from "./gsc";
import type { Module, ModuleId } from "./types";
import { workspaceModules } from "./workspace-proxy";

const workspace = (id: ModuleId): Module => {
  const m = workspaceModules.find((w) => w.id === id);
  if (!m) throw new Error(`modulo proxy sin definir: ${id}`);
  return m;
};

/** Orden determinista = orden de `tools/list` y del dashboard: por fase de verificacion (spec §11): A, B, C. */
export const modules: Module[] = [
  gscModule,
  ga4Module,
  adsModule,
  workspace("people"),
  workspace("calendar"),
  workspace("docs"),
  workspace("sheets"),
  workspace("slides"),
  workspace("gmail"),
  workspace("drive"),
  workspace("chat"),
];

export function getModule(id: string): Module | undefined {
  return modules.find((m) => m.id === id);
}

export function moduleIds(): ModuleId[] {
  return modules.map((m) => m.id);
}
