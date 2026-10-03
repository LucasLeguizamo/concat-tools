import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderModulesDoc, renderToolsDoc, type Lang } from "../lib/docs-gen";

// `pnpm docs:tools`: regenera docs/{es,en}/tools.md y modules.md desde el registro real. Commitea el resultado.
const docs = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs");
for (const lang of ["es", "en"] as Lang[]) {
  mkdirSync(join(docs, lang), { recursive: true });
  writeFileSync(join(docs, lang, "tools.md"), renderToolsDoc(lang));
  writeFileSync(join(docs, lang, "modules.md"), renderModulesDoc(lang));
}
console.log("docs:tools ok");
