/**
 * tool <-> comando (CONTRACTS-M1): el primer `_` separa el grupo; en el resto
 * `_` pasa a `-`. `gsc_list_sites` <-> `concat gsc list-sites`.
 */
export interface CommandRef {
  group: string;
  action: string;
}

export function toolToCommand(tool: string): CommandRef | null {
  const i = tool.indexOf("_");
  if (i <= 0 || i === tool.length - 1) return null;
  return { group: tool.slice(0, i), action: tool.slice(i + 1).replaceAll("_", "-") };
}

export function commandToTool(group: string, action: string): string {
  return `${group}_${action.replaceAll("-", "_")}`;
}

/** Busca en el catálogo vivo la tool que corresponde a `group action`. */
export function findTool<T extends { name: string }>(tools: T[], group: string, action: string): T | undefined {
  const wanted = commandToTool(group, action);
  return tools.find((t) => t.name === wanted);
}
