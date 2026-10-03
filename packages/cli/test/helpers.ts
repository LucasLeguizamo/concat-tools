import type { Deps } from "../src/deps.js";
import type { ToolCallResult, ToolClient, ToolInfo } from "../src/mcp.js";
import type { CredentialStore, Credentials } from "../src/store.js";

export const GATEWAY = "https://gw.test";

export function memoryStore(initial?: Credentials): CredentialStore & { creds: Credentials | null } {
  const s = {
    creds: initial ?? null,
    load: async () => s.creds,
    save: async (_g: string, c: Credentials) => void (s.creds = c),
    clear: async () => void (s.creds = null),
  };
  return s;
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const metadata = {
  issuer: GATEWAY,
  authorization_endpoint: `${GATEWAY}/oauth/authorize`,
  token_endpoint: `${GATEWAY}/oauth/token`,
  device_authorization_endpoint: `${GATEWAY}/oauth/device`,
  revocation_endpoint: `${GATEWAY}/oauth/revoke`,
};

export type Route = (url: URL, init: RequestInit) => Response | Promise<Response> | undefined;

/** fetch falso: la primera ruta que devuelve una Response gana; si no, 404. */
export function fakeFetch(...routes: Route[]): typeof fetch & { calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push({ url: url.href, init });
    for (const r of routes) {
      const res = await r(url, init);
      if (res) return res;
    }
    return json({ error: "not_found" }, 404);
  }) as typeof fetch & { calls: typeof calls };
  f.calls = calls;
  return f;
}

export const discoveryRoute: Route = (url) =>
  url.pathname === "/.well-known/oauth-authorization-server" ? json(metadata) : undefined;

export interface Harness {
  deps: Deps;
  out: string[];
  err: string[];
  opened: string[];
  store: ReturnType<typeof memoryStore>;
  clock: { t: number };
}

export function harness(opts: {
  routes?: Route[];
  tty?: boolean;
  creds?: Credentials | null;
  client?: ToolClient;
  openBrowser?: (url: string) => void;
  env?: NodeJS.ProcessEnv;
} = {}): Harness {
  const clock = { t: 1_000_000 };
  const out: string[] = [];
  const err: string[] = [];
  const opened: string[] = [];
  const store = memoryStore(
    opts.creds === null ? undefined : (opts.creds ?? { access_token: "at-1", refresh_token: "rt-1", expires_at: clock.t + 3_600_000 }),
  );
  const deps: Deps = {
    env: { CONCAT_GATEWAY_URL: GATEWAY, ...opts.env },
    net: {
      fetch: fakeFetch(...(opts.routes ?? []), discoveryRoute),
      sleep: async (ms) => void (clock.t += ms),
      now: () => clock.t,
    },
    store,
    stdout: { write: (s) => void out.push(s), isTTY: opts.tty ?? false },
    stderr: { write: (s) => void err.push(s) },
    openBrowser: (u) => {
      opened.push(u);
      opts.openBrowser?.(u);
    },
    connectTools: async () => {
      if (!opts.client) throw new Error("sin cliente MCP en este test");
      return opts.client;
    },
  };
  return { deps, out, err, opened, store, clock };
}

export function fakeClient(tools: ToolInfo[], onCall: (name: string, args: Record<string, unknown>) => ToolCallResult) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client: ToolClient & { calls: typeof calls } = {
    calls,
    listTools: async () => tools,
    callTool: async (name, args) => {
      calls.push({ name, args });
      return onCall(name, args);
    },
    close: async () => {},
  };
  return client;
}

export const gscPerformance: ToolInfo = {
  name: "gsc_performance",
  description: "Rendimiento de Search Console.\nSegunda línea.",
  inputSchema: {
    type: "object",
    properties: {
      site: { type: "string", description: "Sitio" },
      by: { type: "string", enum: ["query", "page"] },
      limit: { type: "integer" },
    },
    required: ["site"],
  },
};
