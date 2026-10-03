import { randomBytes } from "node:crypto";
import { vi } from "vitest";
import { resetEnvCache } from "../env";
import type { ToolContext } from "./types";

export function setTestEnv(): void {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://x",
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    PUBLIC_URL: "https://gw.example.com",
    VAULT_KEYS: `v1:${randomBytes(32).toString("base64")}`,
    CRON_SECRET: "c".repeat(16),
    JWT_SECRET: "j".repeat(40),
  });
  resetEnvCache();
}

export type FetchCall = { url: string; method: string; headers: Record<string, string>; body: unknown };

/** Reemplaza fetch global con respuestas encoladas; devuelve las llamadas registradas. */
export function mockFetch(responses: Array<{ status?: number; body: unknown; headers?: Record<string, string> }>) {
  const calls: FetchCall[] = [];
  const queue = [...responses];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const next = queue.shift();
      if (!next) throw new Error("mockFetch: sin respuestas en cola");
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
        body: typeof init?.body === "string" ? safeJson(init.body) : init?.body,
      });
      return new Response(typeof next.body === "string" ? next.body : JSON.stringify(next.body), {
        status: next.status ?? 200,
        headers: { "content-type": "application/json", ...next.headers },
      });
    }),
  );
  return calls;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export const TEST_ACCESS_TOKEN = "ya29.test-access-token-should-never-leak";

export const testCtx: ToolContext = { userId: "u1", getAccessToken: async () => TEST_ACCESS_TOKEN };

export type FakeMcpTool = { name: string; description?: string; inputSchema: Record<string, unknown> };
export type FakeMcpCall = { method: string; auth: string | null; params: Record<string, unknown> };

/**
 * Servidor MCP remoto falso (JSON-RPC sobre fetch global, respuestas JSON, stateless) para probar el cliente real de
 * `@modelcontextprotocol/client` sin red. Solo responde a `endpoint`; el resto de URLs sigue en `fallback`.
 */
export function stubRemoteMcp(
  endpoint: string,
  tools: FakeMcpTool[],
  onCall: (name: string, args: Record<string, unknown>) => { isError?: boolean; text?: string; structured?: unknown } = () => ({ text: "{}" }),
  opts: { status?: number } = {},
) {
  const calls: FakeMcpCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url !== endpoint) return new Response("not found", { status: 404 });
      const headers = new Headers(init?.headers);
      if (opts.status) {
        calls.push({ method: "http", auth: headers.get("authorization"), params: {} });
        return new Response(JSON.stringify({ error: { code: opts.status, status: "PERMISSION_DENIED", message: "forbidden" } }), {
          status: opts.status,
          headers: { "content-type": "application/json" },
        });
      }
      if ((init?.method ?? "GET") !== "POST") return new Response(null, { status: 405 });
      const msg = JSON.parse(String(init?.body)) as { id?: number; method: string; params?: Record<string, unknown> };
      calls.push({ method: msg.method, auth: headers.get("authorization"), params: msg.params ?? {} });
      if (msg.id === undefined) return new Response(null, { status: 202 });
      const reply = (result: unknown) =>
        new Response(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }), { headers: { "content-type": "application/json" } });
      switch (msg.method) {
        case "initialize":
          return reply({ protocolVersion: msg.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fake-google", version: "0" } });
        case "tools/list":
          return reply({ tools });
        case "tools/call": {
          const r = onCall(String(msg.params?.name), (msg.params?.arguments ?? {}) as Record<string, unknown>);
          return reply({
            content: [{ type: "text", text: r.text ?? "" }],
            ...(r.structured !== undefined ? { structuredContent: r.structured } : {}),
            ...(r.isError ? { isError: true } : {}),
          });
        }
        default:
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "no" } }), {
            headers: { "content-type": "application/json" },
          });
      }
    }),
  );
  return calls;
}
