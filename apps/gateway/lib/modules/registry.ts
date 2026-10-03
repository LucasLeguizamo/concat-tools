import { ga4Module } from "./ga4";
import { gscModule } from "./gsc";
import type { Module, ModuleId } from "./types";

/** Orden determinista = orden de `tools/list`. M1: gsc, ga4. */
export const modules: Module[] = [gscModule, ga4Module];

export function getModule(id: string): Module | undefined {
  return modules.find((m) => m.id === id);
}

export function moduleIds(): ModuleId[] {
  return modules.map((m) => m.id);
}
