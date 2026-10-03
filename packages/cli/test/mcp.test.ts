import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { connectMcp } from "../src/mcp.js";
import { createSession } from "../src/session.js";
import { memoryStore } from "./helpers.js";

/** Servidor MCP stateless mínimo (Streamable HTTP, respuestas JSON) para probar el transporte real del SDK. */
function startServer(): Promise<{ server: Server; url: string; seen: Array<{ method: string; auth?: string }> }> {
  const seen: Array<{ method: string; auth?: string }> = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.url !== "/mcp" || req.method !== "POST") {
        res.writeHead(405).end();
        return;
      }
      if (req.headers.authorization !== "Bearer good") {
        res.writeHead(401, { "www-authenticate": 'Bearer resource_metadata="http://x/.well-known/oauth-protected-resource"' }).end();
        return;
      }
      const msg = JSON.parse(raw) as { id?: number; method: string; params?: Record<string, unknown> };
      seen.push({ method: msg.method, auth: req.headers.authorization });
      const reply = (result: unknown) =>
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
      if (msg.id === undefined) return void res.writeHead(202).end();
      if (msg.method === "initialize") {
        return reply({ protocolVersion: msg.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fake", version: "0" } });
      }
      if (msg.method === "tools/list") {
        return reply({
          tools: [{ name: "gsc_list_sites", description: "Sitios", inputSchema: { type: "object", properties: { limit: { type: "integer" } } } }],
        });
      }
      if (msg.method === "tools/call") {
        return reply({
          content: [{ type: "text", text: "fallback" }],
          structuredContent: { data: [{ site: "sc-domain:onconcat.com" }], meta: { module: "gsc" } },
        });
      }
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } }),
      );
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen }),
    ),
  );
}

let open: Server | undefined;
afterEach(() => {
  open?.closeAllConnections();
  open?.close();
});

const net = { fetch: globalThis.fetch, sleep: async () => {}, now: () => 0 };

describe("cliente MCP real (Streamable HTTP) contra un gateway simulado", () => {
  it("tools/list y tools/call con Bearer", async () => {
    const s = await startServer();
    open = s.server;
    const store = memoryStore({ access_token: "good", expires_at: Number.MAX_SAFE_INTEGER });
    const client = await connectMcp(createSession(s.url, store, net));
    try {
      const tools = await client.listTools();
      expect(tools).toEqual([expect.objectContaining({ name: "gsc_list_sites", description: "Sitios" })]);
      const res = await client.callTool("gsc_list_sites", { limit: 5 });
      expect(res).toMatchObject({ isError: false, structured: { meta: { module: "gsc" } }, text: "fallback" });
    } finally {
      await client.close();
    }
    expect(s.seen.every((r) => r.auth === "Bearer good")).toBe(true);
    expect(s.seen.map((r) => r.method)).toContain("tools/list");
  });

  it("401 del gateway se traduce a exit 3", async () => {
    const s = await startServer();
    open = s.server;
    const store = memoryStore({ access_token: "bad", expires_at: Number.MAX_SAFE_INTEGER });
    await expect(connectMcp(createSession(s.url, store, net))).rejects.toMatchObject({ exitCode: 3 });
  });
});
