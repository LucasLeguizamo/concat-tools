import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { connectMcp, type ToolClient } from "./mcp.js";
import type { Net } from "./oauth.js";
import type { Session } from "./session.js";
import { createStore, type CredentialStore } from "./store.js";

/** Todo lo que toca el mundo exterior, inyectable para tests. */
export interface Deps {
  env: NodeJS.ProcessEnv;
  net: Net;
  store: CredentialStore;
  stdout: { write(s: string): void; isTTY: boolean };
  stderr: { write(s: string): void };
  openBrowser(url: string): void;
  connectTools(session: Session): Promise<ToolClient>;
}

/** Abre la URL en el navegador por defecto; si falla, el usuario ya vio la URL impresa. */
function openBrowser(url: string): void {
  const [cmd, args]: [string, string[]] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // ignorado a propósito
  }
}

export function realDeps(): Deps {
  return {
    env: process.env,
    net: { fetch: globalThis.fetch, sleep: (ms) => sleep(ms), now: () => Date.now() },
    store: createStore({ warn: (line) => void process.stderr.write(`${line}\n`) }),
    stdout: { write: (s) => void process.stdout.write(s), isTTY: process.stdout.isTTY === true },
    stderr: { write: (s) => void process.stderr.write(s) },
    openBrowser,
    connectTools: connectMcp,
  };
}
