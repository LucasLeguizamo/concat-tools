import type { ModuleId, ModuleStatus } from "./modules/types";

/**
 * Todo el texto visible de las paginas web del gateway, en ES y EN (PRODUCT.md). `en` tiene la misma
 * forma que `es` (lo exige el tipo `Copy`); el idioma se elige por request en lib/i18n.ts.
 */
export const es = {
  lang: "es" as Lang,
  langName: "Español",
  docsUrl: "https://github.com/LucasLeguizamo/concat-tools/blob/main/docs/es/README.md",
  modulesDocsUrl: "https://github.com/LucasLeguizamo/concat-tools/blob/main/docs/es/modules.md",
  help: "Documentación",

  moduleName: {
    gsc: "Search Console",
    ga4: "Analytics 4",
    ads: "Google Ads",
    people: "Contactos",
    calendar: "Calendar",
    docs: "Docs",
    sheets: "Sheets",
    slides: "Slides",
    gmail: "Gmail",
    drive: "Drive",
    chat: "Chat",
  } satisfies Record<ModuleId, string>,

  /** Lo que la cuenta necesita ademas del permiso de Google, por modulo (en /connect y en "sin recursos"). */
  requirement: {
    gsc: "Tu correo debe ser usuario de la propiedad en Search Console. Las propiedades de dominio (sc-domain:) y de prefijo de URL (https://) son distintas.",
    ga4: "Tu correo debe tener rol de lector (o superior) en la propiedad de GA4.",
    ads: "Tu correo debe tener acceso a una cuenta de Google Ads, directo o mediante una cuenta de administrador (MCC).",
    people: "Nada más: se usa tu propia cuenta de Google.",
    calendar: "Nada más: se usa tu propia cuenta de Google.",
    docs: "Nada más: se usa tu propia cuenta de Google.",
    sheets: "Nada más: se usa tu propia cuenta de Google.",
    slides: "Nada más: se usa tu propia cuenta de Google.",
    gmail: "Nada más: se usa tu propia cuenta de Google.",
    drive: "Nada más: se usa tu propia cuenta de Google.",
    chat: "La Chat app del gateway debe estar disponible en tu dominio de Google Workspace.",
  } satisfies Record<ModuleId, string>,

  status: {
    not_connected: "No conectado",
    authorized: "Verificando",
    connected: "Conectado",
    no_resources: "Sin recursos",
    scope_lost: "Permiso perdido",
    expired: "Acceso expirado",
  } satisfies Record<ModuleStatus, string>,

  /** Que significa cada estado y que hacer; null = no hace falta explicacion. */
  statusHint: {
    not_connected: null,
    authorized: "Autorizado; falta la primera consulta real que confirma que ves datos. Si no avanza en un minuto, vuelve a comprobar.",
    connected: null,
    no_resources: "Tu cuenta no ve ningún recurso. Pide acceso y vuelve a comprobar.",
    scope_lost: "Falta el permiso de este módulo en Google. Reconecta; solo se pide ese permiso.",
    expired: "El acceso a Google expiró o fue revocado. Reconecta para renovarlo.",
  } satisfies Record<ModuleStatus, string | null>,

  dashboard: {
    title: "Módulos",
    windowTitle: "concat status",
    signedInAs: "Cuenta de Google",
    signOut: "Cerrar sesión",
    connectedCount: (n: number, total: number) => `${n}/${total} conectados`,
    betaCount: (n: number, total: number) => `beta ${n}/${total}`,
    attention: (n: number) => (n === 1 ? "1 módulo requiere atención." : `${n} módulos requieren atención.`),
    attentionCmd: "Reconecta los que perdieron acceso de una vez:",
    alsoAttention: (n: number) => (n === 1 ? "Otro módulo requiere atención (abajo)." : `Otros ${n} módulos requieren atención (abajo).`),
    otherAccount: "Usar otra cuenta o permisos",
    notConnected: "Sin conectar",
    available: "Disponibles",
    beta: "Beta cerrada · Google Workspace",
    betaNote: "Solo funcionan con cuentas en la lista de prueba de Google mientras se verifica la app.",
    betaHowTo: "Cómo pedir acceso",
    resources: (n: number) => (n === 1 ? "1 recurso" : `${n} recursos`),
    lastProbe: "último chequeo",
    connect: "Conectar",
    reconnect: "Reconectar",
    recheck: "Volver a comprobar",
    rechecking: "Comprobando…",
    checkedTitle: (name: string, status: string) => `${name}: ${status}`,
    disconnect: "Desconectar",
    disconnectConfirm: "Sí, desconectar",
    disconnecting: "Desconectando…",
    keep: "Mantener",
    disconnectWarning: (name: string) =>
      `Tu agente pierde acceso a ${name} de inmediato. Si ningún otro módulo usa el mismo permiso, también se revoca en Google.`,
    cliLabel: "En tu terminal",
    copy: "Copiar",
    copied: "Copiado",
    connectedTitle: (name: string) => `${name} conectado`,
    connectedBody: (resources: string | null) =>
      `${resources ? `Verificado con una consulta real: ${resources}. ` : ""}Tu agente lo usa en su próxima llamada.`,
    doneHint: "Puedes cerrar esta pestaña y volver a tu terminal.",
    notCompletedTitle: (name: string) => `${name}: la conexión no se completó`,
    notCompletedBody: "Google no confirmó el permiso. Vuelve a intentarlo desde la tarjeta del módulo.",
    disconnectedTitle: (name: string) => `${name} desconectado`,
    disconnectFailed: (name: string) => `No se pudo desconectar ${name}. Reintenta en unos instantes.`,
    unknownError: "No se pudo completar la acción. Reintenta en unos instantes.",
    recheckFailed: (name: string) => `No se pudo comprobar ${name}. Reintenta en unos instantes.`,
    rateLimited: (name: string) => `Demasiadas comprobaciones de ${name}. Espera un minuto.`,
    copyFallback: "Selecciona el comando y cópialo",
  },

  login: {
    title: "Iniciar sesión",
    body: "Entra con Google. Solo pedimos tu identidad (correo y perfil); cada servicio pide su propio permiso de solo lectura cuando lo conectas.",
    cta: "Continuar con Google",
    errors: {
      state: "La sesión de login expiró o no coincide. Intenta de nuevo.",
      denied: "Cancelaste el acceso en Google. Puedes volver a intentarlo o cerrar esta pestaña.",
      google: "Google rechazó la solicitud. Intenta de nuevo.",
      no_refresh: "Google no entregó permiso offline. Revoca el acceso de CONCAT en tu cuenta de Google e intenta de nuevo.",
      session: "Tu sesión cambió durante el proceso. Inicia sesión de nuevo.",
    } as Record<string, string>,
    genericError: "No se pudo iniciar sesión.",
    fromApp: "Una aplicación (cliente MCP) pide acceso al gateway. Primero inicia sesión; después verás exactamente qué pide.",
  },

  connect: {
    title: (name: string) => `Conectar ${name}`,
    as: "Conectando como",
    intro: (name: string) => `Vas a dar a CONCAT acceso de solo lectura a ${name}. Google te pedirá confirmar estos permisos:`,
    extra: "Además necesitas",
    verifyNote: "Solo se marca como conectado cuando una consulta real devuelve datos.",
    betaTitle: "Módulo en beta cerrada.",
    betaBody:
      "Funciona solo para las cuentas de la lista de prueba de Google mientras se completa la verificación de la app; el acceso puede caducar a los 7 días.",
    cta: "Conectar con Google",
    back: "Volver",
    errors: {
      denied: "Cancelaste el permiso en Google.",
      scopes_missing: "Desmarcaste el permiso de este módulo en Google. Vuelve a conectar y deja la casilla marcada.",
      account_mismatch: "Elegiste otra cuenta de Google. Usa la misma cuenta con la que iniciaste sesión, o cambia de cuenta abajo.",
      session: "Tu sesión cambió durante el proceso. Intenta de nuevo.",
      google: "Google rechazó la solicitud. Intenta de nuevo.",
      state: "La solicitud expiró. Intenta de nuevo.",
    } as Record<string, string>,
    genericError: "No se pudo conectar el módulo.",
  },

  consent: {
    title: "Autorizar aplicación",
    expiredTitle: "Solicitud expirada",
    expiredBody: "Esta solicitud de autorización no existe o ya expiró. Vuelve a iniciarla desde tu aplicación o tu terminal:",
    invalidTitle: "Cliente no válido",
    invalidBody: "No se pudo validar la aplicación que solicita acceso.",
    wants: "quiere leer, a través del gateway, los datos de Google de esta cuenta",
    today: (list: string) => `Hoy incluye: ${list}.`,
    todayNone: "Hoy no incluye nada: aún no conectaste ningún módulo.",
    client: "Cliente",
    returnsTo: "Volverás a",
    scope: "Permisos",
    readOnly: "Solo lectura. La aplicación nunca ve ni recibe tus tokens de Google.",
    approve: "Aprobar",
    approving: "Aprobando…",
    deny: "Denegar",
    denying: "Denegando…",
  },

  device: {
    title: "Autorizar un dispositivo",
    approveTitle: "Autorizar dispositivo",
    doneTitle: "Dispositivo autorizado",
    doneBody: "Listo. Vuelve a tu terminal: la CLI termina el inicio de sesión sola.",
    deniedTitle: "Acceso denegado",
    deniedBody: "El código ya no sirve. Si no iniciaste tú este login, no tienes que hacer nada más: tus tokens de Google nunca salieron del gateway.",
    codeLabel: "Código que muestra tu terminal",
    codeHelp: "Escríbelo a mano (concat login --device). No lo pegues desde un enlace que te hayan enviado.",
    codeError: "Código no válido, expirado o demasiados intentos. Pide uno nuevo en la CLI.",
    continue: "Continuar",
    wants: "pide acceso como",
    client: "Cliente",
    code: "Código",
    started: "Iniciado",
    from: "Desde (aproximado)",
    unknown: "desconocido",
    scope: "Permisos",
    warning:
      "Aprueba solo si TÚ iniciaste este login ahora mismo y la hora y la ubicación te resultan familiares. Si alguien te pidió este código, es un intento de robo de cuenta: deniega.",
    approve: "Aprobar",
    approving: "Aprobando…",
    deny: "Denegar",
    denying: "Denegando…",
  },

  error: {
    title: "No se pudo continuar",
    next: "Vuelve a iniciar el proceso desde tu terminal o tu aplicación (por ejemplo",
  },

  notFound: {
    title: "No existe",
    body: "Esta página no existe en el gateway. Empieza desde tu terminal o revisa tus módulos.",
  },

  home: {
    title: "Google Gateway",
    body: "Un gateway entre tu agente y Google. Inicias sesión una vez; el agente nunca ve tokens de Google. Solo lectura.",
    start: "Empieza desde tu terminal",
    dashboard: "Ver mis módulos",
  },

  switchAccount: { notYou: (email: string) => `¿No es ${email}?`, cta: "Usar otra cuenta" },

  scope: (scope: string) =>
    scope.trim() === "*" ? "Todos los módulos que conectes (solo lectura)" : `Módulos: ${scope} (solo lectura)`,

  utc: "UTC",
};

export type Lang = "es" | "en";
export type Copy = typeof es;

export const en: Copy = {
  lang: "en",
  langName: "English",
  docsUrl: "https://github.com/LucasLeguizamo/concat-tools/blob/main/docs/en/README.md",
  modulesDocsUrl: "https://github.com/LucasLeguizamo/concat-tools/blob/main/docs/en/modules.md",
  help: "Docs",

  moduleName: {
    gsc: "Search Console",
    ga4: "Analytics 4",
    ads: "Google Ads",
    people: "Contacts",
    calendar: "Calendar",
    docs: "Docs",
    sheets: "Sheets",
    slides: "Slides",
    gmail: "Gmail",
    drive: "Drive",
    chat: "Chat",
  },

  requirement: {
    gsc: "Your email must be a user of the property in Search Console. Domain properties (sc-domain:) and URL-prefix properties (https://) are different.",
    ga4: "Your email needs the Viewer role (or higher) on the GA4 property.",
    ads: "Your email needs access to a Google Ads account, directly or through a manager account (MCC).",
    people: "Nothing else: your own Google account is used.",
    calendar: "Nothing else: your own Google account is used.",
    docs: "Nothing else: your own Google account is used.",
    sheets: "Nothing else: your own Google account is used.",
    slides: "Nothing else: your own Google account is used.",
    gmail: "Nothing else: your own Google account is used.",
    drive: "Nothing else: your own Google account is used.",
    chat: "The gateway's Chat app must be available in your Google Workspace domain.",
  },

  status: {
    not_connected: "Not connected",
    authorized: "Verifying",
    connected: "Connected",
    no_resources: "No resources",
    scope_lost: "Permission lost",
    expired: "Access expired",
  },

  statusHint: {
    not_connected: null,
    authorized: "Authorized; waiting for the first real query that confirms you can see data. If it doesn't move within a minute, check again.",
    connected: null,
    no_resources: "Your account can't see any resource. Get access, then check again.",
    scope_lost: "This module's permission is missing in Google. Reconnect; only that permission is requested.",
    expired: "Google access expired or was revoked. Reconnect to renew it.",
  },

  dashboard: {
    title: "Modules",
    windowTitle: "concat status",
    signedInAs: "Google account",
    signOut: "Sign out",
    connectedCount: (n, total) => `${n}/${total} connected`,
    betaCount: (n, total) => `beta ${n}/${total}`,
    attention: (n) => (n === 1 ? "1 module needs attention." : `${n} modules need attention.`),
    attentionCmd: "Reconnect everything that lost access at once:",
    alsoAttention: (n) => (n === 1 ? "One other module needs attention (below)." : `${n} other modules need attention (below).`),
    otherAccount: "Use another account or permissions",
    notConnected: "Not connected",
    available: "Available",
    beta: "Closed beta · Google Workspace",
    betaNote: "Only works with accounts on Google's test list while the app is being verified.",
    betaHowTo: "How to request access",
    resources: (n) => (n === 1 ? "1 resource" : `${n} resources`),
    lastProbe: "last check",
    connect: "Connect",
    reconnect: "Reconnect",
    recheck: "Check again",
    rechecking: "Checking…",
    checkedTitle: (name, status) => `${name}: ${status}`,
    disconnect: "Disconnect",
    disconnectConfirm: "Yes, disconnect",
    disconnecting: "Disconnecting…",
    keep: "Keep",
    disconnectWarning: (name) =>
      `Your agent loses access to ${name} immediately. If no other module uses the same permission, it is also revoked in Google.`,
    cliLabel: "In your terminal",
    copy: "Copy",
    copied: "Copied",
    connectedTitle: (name) => `${name} connected`,
    connectedBody: (resources) =>
      `${resources ? `Verified with a real query: ${resources}. ` : ""}Your agent uses it on its next call.`,
    doneHint: "You can close this tab and go back to your terminal.",
    notCompletedTitle: (name) => `${name}: the connection didn't complete`,
    notCompletedBody: "Google didn't confirm the permission. Try again from the module's card.",
    disconnectedTitle: (name) => `${name} disconnected`,
    disconnectFailed: (name) => `Couldn't disconnect ${name}. Try again in a moment.`,
    unknownError: "Couldn't complete the action. Try again in a moment.",
    recheckFailed: (name) => `Couldn't check ${name}. Try again in a moment.`,
    rateLimited: (name) => `Too many checks for ${name}. Wait a minute.`,
    copyFallback: "Select the command and copy it",
  },

  login: {
    title: "Sign in",
    body: "Continue with Google. We only ask for your identity (email and profile); each service asks for its own read-only permission when you connect it.",
    cta: "Continue with Google",
    errors: {
      state: "The sign-in session expired or doesn't match. Try again.",
      denied: "You cancelled access in Google. You can try again or close this tab.",
      google: "Google rejected the request. Try again.",
      no_refresh: "Google didn't grant offline access. Remove CONCAT's access in your Google account and try again.",
      session: "Your session changed during the process. Sign in again.",
    },
    genericError: "Couldn't sign in.",
    fromApp: "An application (MCP client) is asking for access to the gateway. Sign in first; then you'll see exactly what it asks for.",
  },

  connect: {
    title: (name) => `Connect ${name}`,
    as: "Connecting as",
    intro: (name) => `You're giving CONCAT read-only access to ${name}. Google will ask you to confirm these permissions:`,
    extra: "You also need",
    verifyNote: "It's only marked connected when a real query returns data.",
    betaTitle: "Closed beta module.",
    betaBody:
      "Only works for accounts on Google's test list while the app verification completes; access may expire after 7 days.",
    cta: "Connect with Google",
    back: "Back",
    errors: {
      denied: "You cancelled the permission in Google.",
      scopes_missing: "You unchecked this module's permission in Google. Connect again and leave the box checked.",
      account_mismatch: "You picked a different Google account. Use the account you signed in with, or switch accounts below.",
      session: "Your session changed during the process. Try again.",
      google: "Google rejected the request. Try again.",
      state: "The request expired. Try again.",
    },
    genericError: "Couldn't connect the module.",
  },

  consent: {
    title: "Authorize application",
    expiredTitle: "Request expired",
    expiredBody: "This authorization request doesn't exist or has expired. Start it again from your application or your terminal:",
    invalidTitle: "Invalid client",
    invalidBody: "The application requesting access couldn't be validated.",
    wants: "wants to read, through the gateway, the Google data of this account",
    today: (list) => `Today this includes: ${list}.`,
    todayNone: "Today this includes nothing: you haven't connected any module yet.",
    client: "Client",
    returnsTo: "Returns to",
    scope: "Permissions",
    readOnly: "Read-only. The application never sees or receives your Google tokens.",
    approve: "Approve",
    approving: "Approving…",
    deny: "Deny",
    denying: "Denying…",
  },

  device: {
    title: "Authorize a device",
    approveTitle: "Authorize device",
    doneTitle: "Device authorized",
    doneBody: "Done. Go back to your terminal: the CLI finishes signing in on its own.",
    deniedTitle: "Access denied",
    deniedBody: "The code no longer works. If you didn't start this sign-in, you don't need to do anything else: your Google tokens never left the gateway.",
    codeLabel: "Code shown in your terminal",
    codeHelp: "Type it by hand (concat login --device). Don't paste it from a link someone sent you.",
    codeError: "Invalid or expired code, or too many attempts. Get a new one from the CLI.",
    continue: "Continue",
    wants: "requests access as",
    client: "Client",
    code: "Code",
    started: "Started",
    from: "From (approximate)",
    unknown: "unknown",
    scope: "Permissions",
    warning:
      "Approve only if YOU started this sign-in right now and the time and location look familiar. If someone asked you for this code, it's an account takeover attempt: deny.",
    approve: "Approve",
    approving: "Approving…",
    deny: "Deny",
    denying: "Denying…",
  },

  error: {
    title: "Couldn't continue",
    next: "Start the process again from your terminal or your application (for example",
  },

  notFound: {
    title: "Not found",
    body: "This page doesn't exist on the gateway. Start from your terminal or check your modules.",
  },

  home: {
    title: "Google Gateway",
    body: "A gateway between your agent and Google. You sign in once; the agent never sees Google tokens. Read-only.",
    start: "Start from your terminal",
    dashboard: "See my modules",
  },

  switchAccount: { notYou: (email) => `Not ${email}?`, cta: "Use another account" },

  scope: (scope) => (scope.trim() === "*" ? "Every module you connect (read-only)" : `Modules: ${scope} (read-only)`),

  utc: "UTC",
};

export const COPY: Record<Lang, Copy> = { es, en };
export const LANG_COOKIE = "concat_lang";

/** Cookie explicita (selector del pie) > primer idioma soportado de Accept-Language > espanol. */
export function pickLang(cookie: string | undefined, acceptLanguage: string | null): Lang {
  if (cookie === "es" || cookie === "en") return cookie;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const tag = part.trim().slice(0, 2).toLowerCase();
    if (tag === "es" || tag === "en") return tag;
  }
  return "es";
}

export const moduleName = (t: Copy, id: string): string => (t.moduleName as Record<string, string>)[id] ?? id;

/** `2026-10-04T20:10:00Z` -> `2026-10-04 20:10 UTC` */
export const utcMinute = (t: Copy, iso: string): string => `${iso.replace("T", " ").slice(0, 16)} ${t.utc}`;
