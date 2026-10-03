import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseVaultKeys } from "./env";
import { createVault } from "./vault";

const k = () => randomBytes(32).toString("base64");
const ring = (...v: string[]) => parseVaultKeys(v.map((x, i) => `v${i + 1}:${x}`).join(","));

describe("vault", () => {
  it("round-trip y usa la ultima clave como activa", () => {
    const v = createVault(ring(k(), k()));
    const s = v.encrypt("1//refresh-token");
    expect(s.keyVersion).toBe("v2");
    expect(s.nonce.length).toBe(12);
    expect(s.ct.toString("utf8")).not.toContain("refresh");
    expect(v.decrypt(s)).toBe("1//refresh-token");
  });

  it("nonce distinto por registro", () => {
    const v = createVault(ring(k()));
    const a = v.encrypt("x");
    const b = v.encrypt("x");
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.ct.equals(b.ct)).toBe(false);
  });

  it("rotacion: descifra con claves viejas del keyring", () => {
    const k1 = k();
    const old = createVault(ring(k1)).encrypt("secreto");
    const k2 = k();
    const rotated = createVault(parseVaultKeys(`v1:${k1},v2:${k2}`));
    expect(old.keyVersion).toBe("v1");
    expect(rotated.decrypt(old)).toBe("secreto");
    expect(rotated.encrypt("n").keyVersion).toBe("v2");
  });

  it("falla con ct manipulado, aad distinto o version desconocida", () => {
    const v = createVault(ring(k()));
    const s = v.encrypt("secreto", "user-1");
    expect(v.decrypt(s, "user-1")).toBe("secreto");
    expect(() => v.decrypt(s, "user-2")).toThrow();
    expect(() => v.decrypt(s)).toThrow();
    const tampered = Buffer.from(s.ct);
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    expect(() => v.decrypt({ ...s, ct: tampered }, "user-1")).toThrow();
    expect(() => v.decrypt({ ...s, keyVersion: "v9" }, "user-1")).toThrow(/desconocida/);
  });

  it("parseVaultKeys rechaza formatos invalidos", () => {
    expect(() => parseVaultKeys("")).toThrow();
    expect(() => parseVaultKeys("abc")).toThrow();
    expect(() => parseVaultKeys(`v1:${randomBytes(16).toString("base64")}`)).toThrow(/32 bytes/);
    expect(() => parseVaultKeys(`v1:${k()},v1:${k()}`)).toThrow(/duplicada/);
  });
});
