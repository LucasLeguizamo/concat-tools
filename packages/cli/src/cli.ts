import { connect, disconnect, login, logout, status, tokens, tools } from "./commands.js";
import { createCtx, type Ctx } from "./context.js";
import { resolveGateway, resolveProfile } from "./config.js";
import type { Deps } from "./deps.js";
import { CliError, EXIT, formatActionable, scrub, usageError } from "./errors.js";
import { runCall, runGenerated } from "./generated.js";
import { VERSION } from "./version.js";

const HELP = `concat ${VERSION} - CLI de CONCAT Google Gateway

Uso:
  concat login [--device|--copy] Inicia sesión (navegador; --copy copia el link para abrirlo en otro
                                 navegador/perfil de este equipo; --device para otro equipo)
  concat logout                  Revoca y borra las credenciales locales
  concat status                  Estado real de cada módulo
  concat connect <módulo...>     Autoriza módulos (gsc, ga4, ...) y espera la conexión
  concat disconnect <módulo...>  Desconecta módulos (revoca en Google si ningún otro lo usa)
  concat tokens create|list|revoke  Tokens del gateway para n8n/CI (--name, --scope gsc,ga4, --expires 90d)
  concat tools                   Catálogo vivo de herramientas
  concat <grupo> <acción> ...    Ejecuta una herramienta (gsc performance --site ...)
  concat call <tool> '<json>'    Escape genérico: llama a una herramienta por nombre

Opciones globales:
  --gateway <url>   Gateway (default: $CONCAT_GATEWAY_URL o https://gw.onconcat.com)
  --profile <nombre>  Sesión con otra cuenta (cada perfil tiene su propio login)
  --json            Salida JSON aunque stdout sea una terminal
  -h, --help        Ayuda; en comandos generados: concat <grupo> <acción> --help

Entorno:
  CONCAT_PROFILE      Perfil por defecto (o un archivo .concat-profile en la raíz del proyecto)
  CONCAT_TOKEN        Token de API (cgw_…, de "concat tokens create") para CI/n8n: sin login interactivo

Exit codes: 0 ok, 1 otro, 2 uso, 3 no autenticado, 4 cuota, 5 módulo no conectado, 6 permiso de recurso`;

const BUILTIN_HELP: Record<string, string> = {
  login: "Uso: concat login [--device|--copy] [--profile <nombre>]\n  --copy    No abre el navegador: copia el link al portapapeles para pegarlo en otro navegador o perfil\n            de este equipo (útil si tu navegador ya tiene otra cuenta).\n  --device  Device flow: muestra un código y una URL, para iniciar sesión desde otro equipo.",
  logout: "Uso: concat logout",
  status: "Uso: concat status [--json]",
  connect: "Uso: concat connect <módulo...> [--timeout <segundos>] [--copy]\n  --copy  Copia el link en vez de abrir el navegador (ábrelo donde tengas la sesión de esa cuenta).",
  disconnect: "Uso: concat disconnect <módulo...>",
  tokens:
    "Uso: concat tokens create --name <nombre> [--scope gsc,ga4] [--expires 90d]\n     concat tokens list\n     concat tokens revoke <id>\n  El secreto se muestra una sola vez.",
  tools: "Uso: concat tools [--json]",
  call: "Uso: concat call <tool> '<json>'",
};

interface Globals {
  gateway?: string;
  profile?: string;
  json: boolean;
  rest: string[];
}

/** Extrae --gateway, --profile y --json de cualquier posición; el resto va al comando. */
export function extractGlobals(argv: string[]): Globals {
  const g: Globals = { json: false, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") g.json = true;
    else if (a === "--gateway") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw usageError("--gateway requiere una URL.");
      g.gateway = v;
    } else if (a.startsWith("--gateway=")) g.gateway = a.slice("--gateway=".length);
    else if (a === "--profile") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw usageError("--profile requiere un nombre.");
      g.profile = v;
    } else if (a.startsWith("--profile=")) g.profile = a.slice("--profile=".length);
    else g.rest.push(a);
  }
  return g;
}

async function dispatch(ctx: Ctx, command: string, rest: string[]): Promise<number> {
  const wantsHelp = rest.includes("--help") || rest.includes("-h");
  const builtinHelp = BUILTIN_HELP[command === "token" ? "tokens" : command];
  if (builtinHelp !== undefined && wantsHelp) {
    ctx.deps.stdout.write(`${builtinHelp}\n`);
    return EXIT.OK;
  }
  switch (command) {
    case "login":
      return login(ctx, rest);
    case "logout":
      return logout(ctx, rest);
    case "status":
      return status(ctx, rest);
    case "connect":
      return connect(ctx, rest);
    case "disconnect":
      return disconnect(ctx, rest);
    case "tokens":
    case "token":
      return tokens(ctx, rest);
    case "tools":
      return tools(ctx, rest);
    case "call": {
      if (rest.some((a) => a.startsWith("-") && a !== "-")) {
        // los argumentos JSON no empiezan por "-"; cualquier flag aquí es un error de uso
        throw usageError("Uso: concat call <tool> '<json>'");
      }
      return runCall(ctx, rest);
    }
    default:
      return runGenerated(ctx, command, rest);
  }
}

/** Punto de entrada testeable: devuelve el exit code. */
export async function run(argv: string[], deps: Deps): Promise<number> {
  let json = !deps.stdout.isTTY;
  try {
    const g = extractGlobals(argv);
    json = g.json || json;
    const [command, ...rest] = g.rest;
    if (command === undefined || command === "help" || command === "--help" || command === "-h") {
      deps.stdout.write(`${HELP}\n`);
      return command === undefined ? EXIT.USAGE : EXIT.OK;
    }
    if (command === "--version" || command === "-v" || command === "version") {
      deps.stdout.write(`${VERSION}\n`);
      return EXIT.OK;
    }
    if (command.startsWith("-")) throw usageError(`Opción desconocida: ${command}`);
    const ctx = createCtx(
      deps,
      resolveGateway(g.gateway, deps.env),
      g.json,
      resolveProfile(g.profile, deps.env, deps.cwd),
    );
    return await dispatch(ctx, command, rest);
  } catch (err) {
    const e = err instanceof CliError ? err : new CliError(scrub(err instanceof Error ? err.message : String(err)), EXIT.OTHER);
    if (json) deps.stdout.write(`${JSON.stringify(e.toActionable(), null, 2)}\n`);
    else deps.stderr.write(`${formatActionable(e.toActionable())}\n`);
    return e.exitCode;
  }
}
