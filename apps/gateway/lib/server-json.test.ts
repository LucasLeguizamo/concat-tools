import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// server.json (MCP Registry oficial). Esquema verificado el 2026-10-03: static.modelcontextprotocol.io/schemas/2025-12-11.
// Reglas copiadas del esquema: name `^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$` (3-200), description 1-100, version sin rangos ni "latest".
const server = JSON.parse(readFileSync(new URL("../../../server.json", import.meta.url), "utf8")) as Record<string, unknown>;

describe("server.json", () => {
  it("cumple las reglas del esquema del registro oficial", () => {
    expect(server.$schema).toBe("https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json");
    expect(server.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    const description = server.description as string;
    expect(description.length).toBeGreaterThanOrEqual(1);
    expect(description.length).toBeLessThanOrEqual(100);
    expect(server.version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    expect(server.title as string).toBeTruthy();
  });

  it("el remoto es streamable-http https y el namespace corresponde al dominio (verificacion DNS/HTTP)", () => {
    const remotes = server.remotes as Array<{ type: string; url: string }>;
    expect(remotes).toEqual([{ type: "streamable-http", url: "https://gw.onconcat.com/mcp" }]);
    const host = new URL(remotes[0]!.url).hostname; // gw.onconcat.com
    const namespace = (server.name as string).split("/")[0]!; // com.onconcat
    const reversed = namespace.split(".").reverse().join("."); // onconcat.com
    expect(host === reversed || host.endsWith(`.${reversed}`)).toBe(true);
  });

  it("no lista @lucasleguizamo/concat como paquete: es una CLI, no un servidor MCP stdio", () => {
    expect(server.packages).toBeUndefined();
  });
});
