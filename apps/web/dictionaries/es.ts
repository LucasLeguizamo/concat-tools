import type { HowStep, IconName, ModuleId, TermLine } from "./types";

const t = (lines: TermLine[]): TermLine[] => lines;

const moduleCopy: Record<ModuleId, { name: string; extra: string }> = {
  gsc: { name: "Search Console", extra: "Tu correo debe ser usuario de la propiedad." },
  ga4: { name: "Google Analytics 4", extra: "Rol Viewer en la propiedad." },
  ads: { name: "Google Ads", extra: "Acceso a la cuenta, o login-customer-id del MCC." },
  people: { name: "People", extra: "Perfil y contactos." },
  calendar: { name: "Calendar", extra: "Calendarios y eventos." },
  docs: { name: "Docs", extra: "Lectura de documentos." },
  sheets: { name: "Sheets", extra: "Valores y metadatos." },
  slides: { name: "Slides", extra: "Lectura de presentaciones." },
  gmail: { name: "Gmail", extra: "Scope restringido." },
  drive: { name: "Drive", extra: "Scope restringido." },
  chat: { name: "Chat", extra: "Scope restringido." },
};

export const es = {
  lang: "es",
  meta: {
    title: "CONCAT Tools | Conectores open source para agentes de IA (CLI + MCP)",
    description:
      "Una colección de conectores simples y open source: tu agente usa Search Console, GA4, Google Ads y Workspace desde una CLI o MCP. Solo lectura, licencia MIT.",
    ogLocale: "es_ES",
  },
  common: {
    skip: "Saltar al contenido",
    copy: "Copiar",
    copied: "Copiado",
    copyFailed: "No se pudo copiar",
    github: "GitHub",
    exampleData: "Datos de ejemplo",
  },
  nav: {
    tagline: "Conectores para agentes.",
    label: "Principal",
    links: {
      problem: "Problema",
      solution: "Solución",
      how: "Cómo funciona",
      why: "Por qué",
      pricing: "Precios",
    },
    cta: "Empezar",
    langLabel: "Idioma",
  },
  hero: {
    eyebrow: "CLI + MCP · 100% open source · MIT",
    titleMain: "Conectores simples para tu agente.",
    titleAccent: "Desde la terminal.",
    sub: "Una colección open source de conectores: una CLI y un MCP para que Claude, Cursor, n8n o tu shell usen Search Console, GA4, Google Ads y Workspace. Empezamos por Google; vienen más. Solo lectura y errores que dicen cómo arreglarse.",
    ctaPrimary: "Instalar la CLI",
    ctaSecondary: "Ver el código",
    facts: [
      "Solo lectura",
      "AES-256-GCM",
      "OAuth 2.1 + PKCE",
      "MCP Streamable HTTP",
      "CLI @concat/cli",
      "Licencia MIT",
    ],
    terminalTitle: "~/proyecto — concat",
    terminalLabel: "Ejemplo de sesión de terminal con la CLI de CONCAT",
    terminal: t([
      { kind: "cmd", text: "npx @concat/cli login" },
      { kind: "ok", text: "sesión iniciada · ana@ejemplo.com" },
      { kind: "cmd", text: "concat connect gsc" },
      { kind: "out", text: "autorizando webmasters.readonly ..." },
      { kind: "ok", text: "probe sites.list → 3 propiedades · connected" },
      { kind: "cmd", text: "concat gsc striking-distance --site onconcat.com" },
      { kind: "out", text: "QUERY               POS   IMPR  +CLK" },
      { kind: "out", text: "facturas con n8n   11.4  1.840   ~96" },
      { kind: "out", text: "bot whatsapp pyme   9.7    920   ~61" },
      { kind: "out", text: "n8n vs make        14.2  2.310   ~48" },
      { kind: "dim", text: "3 de 41 · pos 8-20 · 28 d · sin marca" },
    ]),
  },
  compare: {
    eyebrow: "demo / misma pregunta, dos gateways",
    title: "Qué cambia cuando el gateway piensa en tareas.",
    sub: "A la izquierda, lo que suele pasar con un wrapper MCP genérico. A la derecha, CONCAT. La sesión es ilustrativa.",
    bad: {
      label: "wrapper MCP típico",
      windowTitle: "mcp-wrapper",
      lines: t([
        { kind: "cmd", text: "tools/list" },
        { kind: "warn", text: "43 tools registradas (get_*, list_*, batch_* ...)" },
        { kind: "cmd", text: 'gsc_query {"rowLimit": 25000}' },
        { kind: "out", text: '[{"keys":["facturas con n8n"],"clicks":4,"impressions":1840,"ctr":0.0021,"position":11.4},' },
        { kind: "out", text: ' {"keys":["bot whatsapp pyme"],"clicks":2,"impressions":920,"ctr":0.0022, ...' },
        { kind: "dim", text: "... 24.998 filas más" },
        { kind: "cmd", text: "status" },
        { kind: "warn", text: "connected" },
        { kind: "cmd", text: "gsc_query" },
        { kind: "err", text: "Error 403: The caller does not have permission" },
      ]),
      points: ["40+ tools", "Dump crudo", "\"connected\" falso", "403 opaco"],
    },
    good: {
      label: "CONCAT",
      windowTitle: "concat",
      lines: t([
        { kind: "cmd", text: "concat tools" },
        { kind: "out", text: "striking_distance · cannibalization · content_decay · ctr_gaps · gsc_ga4_join" },
        { kind: "cmd", text: "concat gsc striking-distance --site onconcat.com" },
        { kind: "ok", text: "3 oportunidades · +205 clics potenciales / 28 d" },
        { kind: "cmd", text: "concat calendar events" },
        { kind: "err", text: "exit 5 · scope_lost" },
        { kind: "out", text: '{ "error": "scope_lost", "module": "calendar",' },
        { kind: "out", text: '  "message": "Calendar perdió el permiso de lectura.",' },
        { kind: "out", text: '  "fix": "Reconecta solo ese módulo; los demás siguen vivos.",' },
        { kind: "ok", text: '  "next_action": "reconnect_module",' },
        { kind: "ok", text: '  "url": "https://gw.onconcat.com/connect/calendar" }' },
      ]),
      points: ["5 tools de tarea", "Salida compacta", "Conectado = el probe devolvió datos", "Error con next_action y URL"],
    },
    note: "Las tools de tarea (striking distance, canibalización, content decay, CTR gaps, join GSC↔GA4) llegan en v1.1 sobre los módulos GSC y GA4. Hoy el gateway ya expone las herramientas base de lectura.",
  },
  problem: {
    eyebrow: "01 / problema",
    title: "Conectar un agente a Google hoy sale caro y a ciegas.",
    items: [
      {
        icon: "stack" as IconName,
        title: "Cuarenta tools, cero criterio",
        text: "Los wrappers registran una herramienta por cada método de la API. El agente gasta el contexto eligiendo en vez de resolver.",
      },
      {
        icon: "dump" as IconName,
        title: "Dumps crudos",
        text: "Miles de filas JSON sin resumir. El modelo se ahoga en datos y tú pagas los tokens.",
      },
      {
        icon: "ghost" as IconName,
        title: "Un \"conectado\" que miente",
        text: "El login termina y el panel dice OK. La primera consulta vuelve vacía y nadie sabe por qué.",
      },
      {
        icon: "block" as IconName,
        title: "403 sin salida",
        text: "Forbidden. Ni tú ni el agente saben qué permiso falta, ni en qué pantalla de Google se arregla.",
      },
      {
        icon: "lock" as IconName,
        title: "Permisos de más",
        text: "Scopes de escritura desde el primer día y refresh tokens en un .env que el propio agente puede leer.",
      },
    ],
  },
  solution: {
    eyebrow: "02 / solución",
    title: "Un gateway entre tu agente y Google.",
    sub: "Inicias sesión una vez. El gateway guarda el refresh token cifrado y el agente solo recibe un token del gateway. Cada servicio es un módulo con sus scopes, su probe y sus herramientas.",
    flow: { agent: "Agente", gateway: "Gateway", google: "Google" },
    flowCaption: "OAuth 2.1 hacia el agente, OAuth de Google hacia el servicio.",
    phases: {
      A: { label: "Fase A", status: "Primera en verificarse", text: "Módulos nativos. Los primeros que pasan la verificación de Google." },
      B: { label: "Beta", status: "Scopes sensibles", text: "Funcionan en pruebas con lista de invitados. Requieren demo y justificación por scope." },
      C: { label: "Beta cerrada", status: "Scopes restringidos", text: "Exigen evaluación de seguridad CASA, renovada cada 12 meses. Solo lista de prueba." },
    },
    scopeLabel: "scope",
    toolsLabel: "tools",
    tasks: {
      label: "v1.1 · tools de tarea",
      title: "Cinco preguntas, cinco tools. No cuarenta wrappers.",
      items: [
        { name: "striking_distance", text: "Queries en posición 8-20 con clics por ganar." },
        { name: "cannibalization", text: "Páginas que compiten entre sí por la misma query." },
        { name: "content_decay", text: "Qué páginas pierden tráfico y por qué." },
        { name: "ctr_gaps", text: "CTR por debajo de la curva propia del sitio." },
        { name: "gsc_ga4_join", text: "Join GSC↔GA4 con match_rate reportado." },
      ],
    },
    modules: moduleCopy,
  },
  how: {
    eyebrow: "03 / cómo funciona",
    title: "De cero a datos en cuatro pasos.",
    steps: <HowStep[]>[
      {
        title: "Login",
        text: "Una sola vez. Navegador con PKCE; en una máquina sin navegador, device code. El token queda en el keychain del sistema.",
        code: "npx -y @concat/cli@1 login",
      },
      {
        title: "Conecta un módulo",
        text: "Autorización incremental: cada módulo pide solo sus scopes de lectura, cuando lo conectas.",
        code: "concat connect gsc ga4",
      },
      {
        title: "Probe",
        text: "\"Conectado\" significa que la llamada de lista devolvió datos. Si viene vacía, el estado dice exactamente qué hacer.",
        output: t([
          { kind: "cmd", text: "concat status" },
          { kind: "ok", text: "gsc   connected      sites.list → 3" },
          { kind: "warn", text: "ga4   no_resources   accountSummaries → 0" },
          { kind: "dim", text: "fix: GA4 → Admin → Gestión de acceso → agregar tu correo como Viewer" },
        ]),
      },
      {
        title: "Úsalo en tu agente",
        text: "Dos puertas, un mismo catálogo. El host MCP hace el OAuth; la CLI sirve a n8n, CI o a un agente con shell.",
        blocks: [
          { label: "Claude Code", code: "claude mcp add --transport http concat https://gw.onconcat.com/mcp" },
          {
            label: "Cursor · mcp.json",
            code: '{\n  "mcpServers": {\n    "concat": { "url": "https://gw.onconcat.com/mcp" }\n  }\n}',
          },
          { label: "CLI", code: "concat gsc performance --site sc-domain:onconcat.com --by query" },
        ],
      },
    ],
  },
  why: {
    eyebrow: "04 / por qué concat",
    title: "Cuatro decisiones que no se negocian.",
    items: [
      {
        icon: "lock" as IconName,
        title: "Solo lectura, y tokens que el agente nunca ve",
        text: "La v1 pide únicamente scopes de lectura. Los refresh tokens se cifran con AES-256-GCM. Escribir será un permiso por módulo, auditado y revocable.",
        proof: "readOnlyHint: true",
      },
      {
        icon: "unlock" as IconName,
        title: "Open source y self-host",
        text: "Licencia MIT. Levanta tu propio gateway con tu proyecto de Google Cloud, o usa la instancia que opera CONCAT.",
        proof: "LICENSE: MIT",
      },
      {
        icon: "arrow" as IconName,
        title: "Errores accionables",
        text: "Cada fallo trae message, fix y next_action. Dice en qué pantalla de Google arreglar el permiso y, cuando aplica, la URL para reconectar.",
        proof: 'next_action: "reconnect_module"',
      },
      {
        icon: "plug" as IconName,
        title: "MCP y CLI, una sola superficie",
        text: "La CLI es un cliente MCP delgado. Sus subcomandos se generan desde tools/list: una tool nueva aparece en las dos puertas sin publicar versión.",
        proof: "gsc_performance → concat gsc performance",
      },
    ],
  },
  pricing: {
    eyebrow: "05 / precios",
    title: "Gratis si lo alojas tú. Hosted, en beta.",
    selfHost: {
      name: "Self-host",
      price: "Gratis",
      tag: "Licencia MIT",
      features: [
        "Todos los módulos y herramientas",
        "Tu proyecto de Google Cloud y tu verificación",
        "Tu Postgres y tu clave del vault",
        "Las cuotas son las de tu proyecto",
      ],
      cta: "Ver en GitHub",
    },
    hosted: {
      name: "Hosted",
      price: "Beta",
      tag: "Lista de espera",
      features: [
        "Instancia operada por CONCAT en gw.onconcat.com",
        "Sin proyecto de Google ni infraestructura propios",
        "Módulos por fase, a medida que Google los verifica",
        "Precio por definir; entrar a la lista no cuesta nada",
      ],
      cta: "Unirme a la lista de espera",
    },
  },
  cta: {
    eyebrow: "06 / siguiente paso",
    title: "Conecta tu primer módulo desde una terminal.",
    sub: "Open source, MIT. Prueba la CLI o apunta tu host MCP a la instancia de CONCAT.",
    command: "concat connect gsc",
    primary: "Empezar",
    secondary: "Lista de espera hosted",
  },
  footer: {
    copy: "© 2026 CONCAT · MIT",
    privacy: "Privacidad",
    terms: "Términos",
    disclaimer:
      "Google, Gmail, Drive, Docs, Sheets, Slides, Calendar y Chat son marcas de Google LLC. CONCAT Tools es independiente y no está afiliado a Google.",
  },
};

export type Dictionary = typeof es;
