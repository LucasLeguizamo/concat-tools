import { describe, expect, it } from "vitest";
import { clientCountry, clientIp, safeNext } from "./http";

describe("safeNext (anti open-redirect)", () => {
  it("acepta rutas relativas normales, con query y las normaliza", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/oauth/consent?pending=abc")).toBe("/oauth/consent?pending=abc");
    expect(safeNext("/a/./b/../c?x=1#frag")).toBe("/a/c?x=1");
  });

  it("usa fallback si falta o no es ruta propia", () => {
    for (const bad of [null, undefined, "", "dashboard", "https://evil.com", "//evil.com", "javascript:alert(1)"]) {
      expect(safeNext(bad), String(bad)).toBe("/dashboard");
    }
    expect(safeNext("x", "/login")).toBe("/login");
  });

  // Tras normalizar, estos colapsan a "//evil.com" (protocol-relative = otro host en el navegador).
  it.each(["/.//evil.com", "/%2e//evil.com", "/%2E//evil.com", "/a/..//evil.com", "/././/evil.com", "/a/%2e%2e//evil.com"])(
    "normalizacion que produce //host: %s",
    (raw) => {
      expect(safeNext(raw)).toBe("/dashboard");
    },
  );

  it.each([
    ["tab", "/\t/evil.com"],
    ["LF", "/\n/evil.com"],
    ["CR", "/\r/evil.com"],
    ["NUL", "/\u0000/evil.com"],
    ["DEL", "/\u007f/x"],
    ["C1", "/\u0085/x"],
    ["backslash inicial", "/\\evil.com"],
    ["backslash en medio", "/a\\b"],
    ["backslash tras punto", "/.\\/evil.com"],
  ])("caracteres de control o backslash: %s", (_n, raw) => {
    expect(safeNext(raw)).toBe("/dashboard");
  });

  it("rutas absurdamente largas", () => {
    expect(safeNext(`/${"a".repeat(3000)}`)).toBe("/dashboard");
  });
});

describe("clientIp / clientCountry", () => {
  const req = (h: Record<string, string>) => new Request("https://gw.example.com/x", { headers: h });

  it("prefiere cabeceras de Vercel, valida formato y cae a 'unknown'", () => {
    expect(clientIp(req({ "x-vercel-forwarded-for": "203.0.113.5", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.5");
    expect(clientIp(req({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe("198.51.100.2");
    expect(clientIp(req({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIp(req({ "x-forwarded-for": "no-es-ip'; DROP TABLE" }))).toBe("unknown");
    expect(clientIp(req({}))).toBe("unknown");
  });

  it("pais: solo ISO alfa-2", () => {
    expect(clientCountry(req({ "x-vercel-ip-country": "ar" }))).toBe("AR");
    expect(clientCountry(req({ "x-vercel-ip-country": "<script>" }))).toBeNull();
    expect(clientCountry(req({}))).toBeNull();
  });
});
