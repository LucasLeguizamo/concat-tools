import {
  Client,
  SdkHttpError,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import { CliError, EXIT, notAuthenticated, scrub } from "./errors.js";
import type { JsonSchema } from "./schema.js";
import type { Session } from "./session.js";
import { VERSION } from "./version.js";

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
}

export interface ToolCallResult {
  isError: boolean;
  /** `structuredContent`: ToolResult en éxito, ActionableError en error. */
  structured?: unknown;
  /** Fallback de texto si no hay structuredContent. */
  text?: string;
}

/** Superficie mínima del cliente MCP que usa la CLI (permite mockearla en tests). */
export interface ToolClient {
  listTools(): Promise<ToolInfo[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
  close(): Promise<void>;
}

/** Errores del SDK a CliError: 401 = no autenticado; el resto, mensaje sin credenciales. */
export function mapSdkError(err: unknown): CliError {
  if (err instanceof CliError) return err;
  if (UnauthorizedError.isInstance(err)) return notAuthenticated("El gateway rechazó tu sesión.");
  if (SdkHttpError.isInstance(err) && err.status === 401) return notAuthenticated("El gateway rechazó tu sesión.");
  if (SdkHttpError.isInstance(err) && err.status === 429) {
    return new CliError("Demasiadas solicitudes al gateway; reintenta en unos instantes.", EXIT.QUOTA, {
      error: "rate_limited",
      next_action: "retry",
    });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return new CliError(scrub(msg), EXIT.OTHER);
}

export async function connectMcp(session: Session): Promise<ToolClient> {
  await session.accessToken(); // falla limpio (exit 3) antes de abrir el transporte
  const transport = new StreamableHTTPClientTransport(new URL(`${session.gateway}/mcp`), {
    authProvider: {
      token: () => session.accessToken(),
      onUnauthorized: async () => {
        await session.accessToken(true);
      },
    },
  });
  const client = new Client({ name: "concat-cli", version: VERSION });
  try {
    await client.connect(transport);
  } catch (err) {
    await client.close().catch(() => {});
    throw mapSdkError(err);
  }

  return {
    async listTools() {
      try {
        const tools: ToolInfo[] = [];
        let cursor: string | undefined;
        do {
          const page = await client.listTools(cursor ? { cursor } : undefined);
          for (const t of page.tools) {
            const info: ToolInfo = { name: t.name, inputSchema: t.inputSchema as JsonSchema };
            if (t.description) info.description = t.description;
            tools.push(info);
          }
          cursor = page.nextCursor;
        } while (cursor);
        return tools;
      } catch (err) {
        throw mapSdkError(err);
      }
    },
    async callTool(name, args) {
      try {
        const res = await client.callTool({ name, arguments: args });
        const out: ToolCallResult = { isError: res.isError === true };
        if (res.structuredContent !== undefined) out.structured = res.structuredContent;
        const text = res.content
          .flatMap((c) => (c.type === "text" ? [c.text] : []))
          .join("\n");
        if (text) out.text = text;
        return out;
      } catch (err) {
        throw mapSdkError(err);
      }
    },
    close: () => client.close(),
  };
}
