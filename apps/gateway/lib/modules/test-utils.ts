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
