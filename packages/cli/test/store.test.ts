import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createStore, keychainBackend, type Credentials, type Exec } from "../src/store.js";

const creds: Credentials = { access_token: "AT-secret", refresh_token: "RT-secret", expires_at: 123 };
const GW = "https://gw.test";

describe("archivo (fallback)", () => {
  it("guarda con permisos 0600 en directorio 0700 y hace roundtrip", async () => {
    const dir = await mkdtemp(join(tmpdir(), "concat-cli-"));
    const path = join(dir, "sub", "credentials.json");
    const store = createStore({ env: { CONCAT_CREDENTIALS_STORE: "file" }, path });
    await store.save(GW, creds);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(dir, "sub"))).mode & 0o777).toBe(0o700);
    expect(await store.load(GW)).toEqual(creds);
    expect(await store.load("https://otro")).toBeNull();
    await store.clear(GW);
    expect(await store.load(GW)).toBeNull();
  });

  it("un archivo corrupto equivale a no haber sesión", async () => {
    const dir = await mkdtemp(join(tmpdir(), "concat-cli-"));
    const path = join(dir, "c.json");
    const store = createStore({ env: { CONCAT_CREDENTIALS_STORE: "file" }, path });
    await store.save(GW, creds);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, "{no json");
    expect(await store.load(GW)).toBeNull();
  });
});

describe("keychain", () => {
  function fakeKeychain(failWrites = false) {
    const calls: Array<{ cmd: string; args: string[]; input?: string }> = [];
    const mem = new Map<string, string>();
    const exec: Exec = async (cmd, args, input) => {
      calls.push({ cmd, args, ...(input !== undefined ? { input } : {}) });
      if (cmd === "security" && args[0] === "-i") {
        if (failWrites) return { code: 1, stdout: "" };
        const m = /-a "([^"]+)" -w (\S+)/.exec(input ?? "")!;
        mem.set(m[1]!, m[2]!);
        return { code: 0, stdout: "" };
      }
      if (cmd === "security" && args[0] === "find-generic-password") {
        const v = mem.get(args[args.indexOf("-a") + 1]!);
        return v ? { code: 0, stdout: `${v}\n` } : { code: 44, stdout: "" };
      }
      if (cmd === "security" && args[0] === "delete-generic-password") {
        mem.delete(args[args.indexOf("-a") + 1]!);
      }
      return { code: 0, stdout: "" };
    };
    return { exec, calls, mem };
  }

  it("macOS: el secreto viaja por stdin (nunca en argv) y hace roundtrip", async () => {
    const k = fakeKeychain();
    const dir = await mkdtemp(join(tmpdir(), "concat-cli-"));
    const path = join(dir, "c.json");
    const store = createStore({ platform: "darwin", exec: k.exec, env: {}, path });
    await store.save(GW, creds);
    for (const c of k.calls) expect(c.args.join(" ")).not.toMatch(/secret|AT-|RT-/);
    expect(k.calls[0]?.input).toContain("add-generic-password");
    expect(await store.load(GW)).toEqual(creds);
    await expect(readFile(path)).rejects.toThrow(); // no hay copia en claro
    await store.clear(GW);
    expect(await store.load(GW)).toBeNull();
  });

  it("si el keychain falla cae al archivo", async () => {
    const k = fakeKeychain(true);
    const dir = await mkdtemp(join(tmpdir(), "concat-cli-"));
    const path = join(dir, "c.json");
    const store = createStore({ platform: "darwin", exec: k.exec, env: {}, path, warn: () => {} });
    await store.save(GW, creds);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await store.load(GW)).toEqual(creds);
  });

  it("avisa una sola vez (por warn, con ruta y variable) cuando cae al archivo", async () => {
    const k = fakeKeychain(true);
    const dir = await mkdtemp(join(tmpdir(), "concat-cli-"));
    const path = join(dir, "c.json");
    const warnings: string[] = [];
    const store = createStore({ platform: "darwin", exec: k.exec, env: {}, path, warn: (l) => warnings.push(l) });
    await store.save(GW, creds);
    await store.save(GW, { ...creds, access_token: "AT2" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(path);
    expect(warnings[0]).toContain("CONCAT_CREDENTIALS_STORE=file");
    expect(warnings[0]).not.toMatch(/AT-|RT-|AT2/);
  });

  it("no avisa si el archivo se fuerza o si el keychain funciona", async () => {
    const dir = await mkdtemp(join(tmpdir(), "concat-cli-"));
    const warnings: string[] = [];
    const forced = createStore({ env: { CONCAT_CREDENTIALS_STORE: "file" }, path: join(dir, "a.json"), warn: (l) => warnings.push(l) });
    await forced.save(GW, creds);
    const ok = createStore({ platform: "darwin", exec: fakeKeychain().exec, env: {}, path: join(dir, "b.json"), warn: (l) => warnings.push(l) });
    await ok.save(GW, creds);
    expect(warnings).toEqual([]);
  });

  it("Linux usa secret-tool con el secreto en stdin", async () => {
    const calls: Array<{ args: string[]; input?: string }> = [];
    const backend = keychainBackend("linux", async (_c, args, input) => {
      calls.push({ args, ...(input !== undefined ? { input } : {}) });
      return { code: 0, stdout: "" };
    })!;
    await backend.write(GW, "s3cret");
    expect(calls[0]?.args[0]).toBe("store");
    expect(calls[0]?.args.join(" ")).not.toContain("s3cret");
    expect(Buffer.from(calls[0]!.input!, "base64").toString()).toBe("s3cret");
  });

  it("plataformas sin keychain no tienen backend", () => {
    expect(keychainBackend("win32", async () => ({ code: 0, stdout: "" }))).toBeNull();
  });
});
