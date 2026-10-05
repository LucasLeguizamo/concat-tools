import type { ModuleId, ModuleStatus } from "./modules/types";

/**
 * Todo el texto visible de las paginas web del gateway. Un solo lugar para que el ingles (PRODUCT.md:
 * ES + EN) sea agregar otro objeto con la misma forma, no buscar cadenas por cada pagina.
 */
export const es = {
  lang: "es",
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
    authorized: "Autorizado, falta la primera consulta real que confirma que ves datos. Recarga en unos instantes.",
    connected: null,
    no_resources: null,
    scope_lost: "Falta el permiso de este módulo en Google. Reconecta; solo se pide ese permiso.",
    expired: "El acceso a Google expiró o fue revocado. Reconecta para renovarlo.",
  } satisfies Record<ModuleStatus, string | null>,

  dashboard: {
    title: "Módulos",
    windowTitle: "concat status",
    signedInAs: "Sesión",
    signOut: "Cerrar sesión",
    connectedCount: (n: number, total: number) => `${n}/${total} conectados`,
    betaCount: (n: number, total: number) => `beta ${n}/${total}`,
    attention: (n: number) => (n === 1 ? "1 módulo requiere atención." : `${n} módulos requieren atención.`),
    available: "Disponibles",
    beta: "Beta cerrada · Google Workspace",
    betaNote: "Solo funcionan con cuentas en la lista de prueba de Google mientras se verifica la app.",
    betaHowTo: "Cómo pedir acceso",
    resources: (n: number) => (n === 1 ? "1 recurso" : `${n} recursos`),
    lastProbe: "último chequeo",
    connect: "Conectar",
    reconnect: "Reconectar",
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
      `${resources ? `Verificado con una consulta real: ${resources}. ` : ""}Ya puedes volver a tu terminal; tu agente lo usa en su próxima llamada.`,
    disconnectedTitle: (name: string) => `${name} desconectado`,
    disconnectFailed: (name: string) => `No se pudo desconectar ${name}. Reintenta en unos instantes.`,
    unknownError: "No se pudo completar la acción. Reintenta en unos instantes.",
  },

  login: {
    title: "Iniciar sesión",
    body: "Entra con Google. Solo pedimos tu identidad (correo y perfil); cada servicio pide su propio permiso de solo lectura cuando lo conectas.",
    cta: "Continuar con Google",
    errors: {
      state: "La sesión de login expiró o no coincide. Intenta de nuevo.",
      denied: "Cancelaste el acceso en Google.",
      google: "Google rechazó la solicitud. Intenta de nuevo.",
      no_refresh: "Google no entregó permiso offline. Revoca el acceso de CONCAT en tu cuenta de Google e intenta de nuevo.",
      session: "Tu sesión cambió durante el proceso. Inicia sesión de nuevo.",
    } as Record<string, string>,
    genericError: "No se pudo iniciar sesión.",
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
    expiredBody: "Esta solicitud de autorización no existe o ya expiró. Vuelve a iniciarla desde tu aplicación.",
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
  },

  device: {
    title: "Autorizar un dispositivo",
    approveTitle: "Autorizar dispositivo",
    doneTitle: "Dispositivo autorizado",
    doneBody: "Listo. Vuelve a tu terminal: la CLI termina el inicio de sesión sola.",
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

export type Copy = typeof es;

/** ponytail: un solo idioma activo; elegir por Accept-Language o URL cuando exista `en`. */
export const t: Copy = es;

export const moduleName = (id: string): string => (t.moduleName as Record<string, string>)[id] ?? id;

/** `2026-10-04T20:10:00Z` -> `2026-10-04 20:10 UTC` */
export const utcMinute = (iso: string): string => `${iso.replace("T", " ").slice(0, 16)} ${t.utc}`;
