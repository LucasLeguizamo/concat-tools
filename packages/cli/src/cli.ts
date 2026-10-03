import { connect, login, logout, status, tools } from "./commands.js";
import { createCtx, type Ctx } from "./context.js";
import { resolveGateway } from "./config.js";
import type { Deps } from "./deps.js";
import { CliError, EXIT, formatActionable, scrub, usageError } from "./errors.js";
import { runCall, runGenerated } from "./generated.js";
import { VERSION } from "./version.js";

const HELP = `concat ${VERSION} - CLI de CONCAT Google Gateway

Uso:
  concat login [--device]        Inicia sesión (navegador; --device para equipos sin navegador)
  concat logout                  Revoca y borra las credenciales locales
  concat status                  Estado real de cada módulo
  concat connect <módulo...>     Autoriza módulos (gsc, ga4, ...) y espera la conexión
  concat tools                   Catálogo vivo de herramientas
  concat <grupo> <acción> ...    Ejecuta una herramienta (gsc performance --site ...)
  concat call <tool> '<json>'    Escape genérico: llama a una herramienta por nombre

Opciones globales:
  --gateway <url>   Gateway (default: $CONCAT_GATEWAY_URL o https://gw.onconcat.com)
  --json            Salida JSON aunque stdout sea una terminal
  -h, --help        Ayuda; en comandos generados: concat <grupo> <acción> --help

Exit codes: 0 ok, 1 otro, 2 uso, 3 no autenticado, 4 cuota, 5 módulo no conectado, 6 permiso de recurso`;

const BUILTIN_HELP: Record<string, string> = {
  login: "Uso: concat login [--device]\n  --device  Device flow: muestra un código y una URL, sin abrir navegador.",
  logout: "Uso: concat logout",
  status: "Uso: concat status [--json]",
  connect: "Uso: concat connect <módulo...> [--timeout <segundos>]",
  tools: "Uso: concat tools [--json]",
  call: "Uso: concat call <tool> '<json>'",
};

interface Globals {
  gateway?: string;
  json: boolean;
  rest: string[];
}

/** Extrae --gateway y --json de cualquier posición; el resto va al comando. */
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
    else g.rest.push(a);
  }
  return g;
}

async function dispatch(ctx: Ctx, command: string, rest: string[]): Promise<number> {
  const wantsHelp = rest.includes("--help") || rest.includes("-h");
  const builtinHelp = BUILTIN_HELP[command];
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
    const ctx = createCtx(deps, resolveGateway(g.gateway, deps.env), g.json);
    return await dispatch(ctx, command, rest);
  } catch (err) {
    const e = err instanceof CliError ? err : new CliError(scrub(err instanceof Error ? err.message : String(err)), EXIT.OTHER);
    if (json) deps.stdout.write(`${JSON.stringify(e.toActionable(), null, 2)}\n`);
    else deps.stderr.write(`${formatActionable(e.toActionable())}\n`);
    return e.exitCode;
  }
}
