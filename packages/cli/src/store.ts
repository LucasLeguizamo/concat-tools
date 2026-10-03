import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Credentials {
  access_token: string;
  refresh_token?: string;
  /** Epoch ms. */
  expires_at: number;
  scope?: string;
}

/** Almacén de secretos clave (gateway) -> string. */
interface Backend {
  read(account: string): Promise<string | null>;
  write(account: string, secret: string): Promise<void>;
  remove(account: string): Promise<void>;
}

export interface Exec {
  (cmd: string, args: string[], input?: string): Promise<{ code: number; stdout: string }>;
}

/** execFile con stdin; nunca incluye argumentos/salida en errores. */
export const realExec: Exec = (cmd, args, input) =>
  new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { encoding: "utf8", timeout: 15_000 }, (err, stdout) => {
      if (err && typeof err.code !== "number") reject(new Error(`no se pudo ejecutar ${cmd}`));
      else resolve({ code: typeof err?.code === "number" ? err.code : 0, stdout });
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(input ?? "");
  });

const SERVICE = "concat-cli";

/**
 * Keychain del SO sin dependencias nativas. Los secretos nunca van en argv
 * (visible en `ps`): macOS usa `security -i` leyendo comandos de stdin; Linux
 * usa `secret-tool store`, que lee el secreto de stdin. El valor va en base64
 * para no necesitar quoting.
 */
export function keychainBackend(platform: NodeJS.Platform, exec: Exec): Backend | null {
  if (platform === "darwin") {
    const q = (s: string) => `"${s.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
    return {
      async read(account) {
        const r = await exec("security", ["find-generic-password", "-s", SERVICE, "-a", account, "-w"]);
        return r.code === 0 ? Buffer.from(r.stdout.trim(), "base64").toString("utf8") : null;
      },
      async write(account, secret) {
        const b64 = Buffer.from(secret, "utf8").toString("base64");
        const r = await exec("security", ["-i"], `add-generic-password -U -s ${q(SERVICE)} -a ${q(account)} -w ${b64}\n`);
        if (r.code !== 0) throw new Error("keychain no disponible");
      },
      async remove(account) {
        await exec("security", ["delete-generic-password", "-s", SERVICE, "-a", account]);
      },
    };
  }
  if (platform === "linux") {
    const attrs = (account: string) => ["service", SERVICE, "account", account];
    return {
      async read(account) {
        const r = await exec("secret-tool", ["lookup", ...attrs(account)]);
        return r.code === 0 && r.stdout ? Buffer.from(r.stdout.trim(), "base64").toString("utf8") : null;
      },
      async write(account, secret) {
        const b64 = Buffer.from(secret, "utf8").toString("base64");
        const r = await exec("secret-tool", ["store", "--label=CONCAT CLI", ...attrs(account)], b64);
        if (r.code !== 0) throw new Error("secret-tool no disponible");
      },
      async remove(account) {
        await exec("secret-tool", ["clear", ...attrs(account)]);
      },
    };
  }
  return null;
}

export const credentialsPath = (env: NodeJS.ProcessEnv): string =>
  join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "concat", "credentials.json");

/**
 * ponytail: fallback sin keychain (CI, contenedores, Linux sin D-Bus). El
 * archivo guarda los tokens en claro, protegidos solo por permisos: 0600 el
 * archivo y 0700 el directorio. Es el mismo modelo de amenaza que ~/.netrc o
 * ~/.config/gh/hosts.yml.
 */
export function fileBackend(path: string): Backend {
  const load = async (): Promise<Record<string, string>> => {
    try {
      const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {};
    } catch {
      return {};
    }
  };
  const save = async (data: Record<string, string>) => {
    const dir = dirname(path);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700);
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
    await chmod(tmp, 0o600);
    await rename(tmp, path);
  };
  return {
    async read(account) {
      return (await load())[account] ?? null;
    },
    async write(account, secret) {
      await save({ ...(await load()), [account]: secret });
    },
    async remove(account) {
      const data = await load();
      delete data[account];
      if (Object.keys(data).length === 0) await rm(path, { force: true });
      else await save(data);
    },
  };
}

export interface CredentialStore {
  load(gateway: string): Promise<Credentials | null>;
  save(gateway: string, creds: Credentials): Promise<void>;
  clear(gateway: string): Promise<void>;
}

const parseCreds = (raw: string | null): Credentials | null => {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<Credentials>;
    return typeof c.access_token === "string" && typeof c.expires_at === "number" ? (c as Credentials) : null;
  } catch {
    return null;
  }
};

/**
 * Keychain primero; si no existe o falla, archivo. `CONCAT_CREDENTIALS_STORE=file`
 * fuerza el archivo.
 */
export function createStore(
  opts: {
    platform?: NodeJS.Platform;
    exec?: Exec;
    env?: NodeJS.ProcessEnv;
    path?: string;
    /** Aviso para el humano (stderr, nunca stdout). */
    warn?: (line: string) => void;
  } = {},
): CredentialStore {
  const env = opts.env ?? process.env;
  const warn = opts.warn ?? ((line: string) => void process.stderr.write(`${line}\n`));
  let warned = false;
  const keychain =
    env.CONCAT_CREDENTIALS_STORE === "file" ? null : keychainBackend(opts.platform ?? process.platform, opts.exec ?? realExec);
  const filePath = opts.path ?? credentialsPath(env);
  const file = fileBackend(filePath);
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };
  return {
    async load(gateway) {
      const fromKeychain = keychain ? await safe(() => keychain.read(gateway), null) : null;
      return parseCreds(fromKeychain ?? (await file.read(gateway)));
    },
    async save(gateway, creds) {
      const secret = JSON.stringify(creds);
      if (keychain) {
        try {
          await keychain.write(gateway, secret);
          await file.remove(gateway); // no dejar una copia en claro si el keychain funciona
          return;
        } catch {
          // cae al archivo, avisando una sola vez (sin detalles del error: podrían contener secretos)
          if (!warned) {
            warned = true;
            warn(
              `Aviso: el keychain del sistema no está disponible; las credenciales se guardan en ${filePath} (permisos 0600). ` +
                "Para usar siempre este archivo y silenciar el aviso: CONCAT_CREDENTIALS_STORE=file",
            );
          }
        }
      }
      await file.write(gateway, secret);
    },
    async clear(gateway) {
      if (keychain) await safe(() => keychain.remove(gateway), undefined);
      await file.remove(gateway);
    },
  };
}
