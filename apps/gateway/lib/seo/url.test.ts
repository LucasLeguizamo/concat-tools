import { describe, expect, it } from "vitest";
import { inScope, normalizeUrl, parseSite } from "./url";

const key = (u: string, host?: string, keep?: string[]) => normalizeUrl(u, { keepParams: keep }, host)?.key;

describe("normalizeUrl", () => {
  it("http/https, www, host en mayusculas, fragment y slash final colapsan a la misma clave", () => {
    const variants = [
      "https://onconcat.com/blog/x",
      "http://www.onconcat.com/blog/x/",
      "HTTPS://OnConcat.com/blog/x#seccion",
      "https://onconcat.com:443/blog/x",
      "https://onconcat.com/blog//x",
    ];
    for (const v of variants) expect(key(v)).toBe("onconcat.com/blog/x");
  });

  it("GA4: hostName + landingPagePlusQueryString (ruta relativa con utm/gclid) = GSC page", () => {
    expect(key("/blog/x?utm_source=g&gclid=abc&srsltid=1", "www.onconcat.com")).toBe(key("https://onconcat.com/blog/x/"));
    expect(key("/", "onconcat.com")).toBe("onconcat.com/");
    expect(key("https://onconcat.com")).toBe("onconcat.com/");
  });

  it("descarta params salvo allowlist, ordenados", () => {
    expect(key("/c?b=2&a=1&utm_medium=x", "x.com", ["a", "b"])).toBe("x.com/c?a=1&b=2");
    expect(key("/c?page=2&utm_medium=x", "x.com", ["page"])).toBe("x.com/c?page=2");
    expect(key("/c?page=2", "x.com")).toBe("x.com/c");
  });

  it("percent-encoding, mayusculas e index.html", () => {
    expect(key("https://x.com/Gu%C3%ADa/")).toBe(key("https://x.com/guía"));
    expect(key("https://x.com/blog/index.html")).toBe("x.com/blog");
    expect(key("https://x.com/index.php")).toBe("x.com/");
    expect(key("https://x.com/%E0%A4%A")).toBeDefined(); // decode invalido no revienta
  });

  it("(not set), vacio y esquemas raros -> null", () => {
    expect(key("(not set)", "x.com")).toBeUndefined();
    expect(key("/a", "(not set)")).toBeUndefined();
    expect(key("")).toBeUndefined();
    expect(key("ftp://x.com/a")).toBeUndefined();
    expect(key("/a")).toBeUndefined(); // ruta relativa sin hostName
  });

  it("subdominios siguen siendo distintos", () => {
    expect(key("https://blog.x.com/a")).not.toBe(key("https://x.com/a"));
  });
});

describe("parseSite / inScope", () => {
  const n = (u: string, h?: string) => normalizeUrl(u, {}, h)!;

  it("sc-domain incluye subdominios y www", () => {
    const s = parseSite("sc-domain:OnConcat.com")!;
    expect(s).toEqual({ host: "onconcat.com", kind: "domain", pathPrefix: "" });
    expect(inScope(s, n("https://www.onconcat.com/a"))).toBe(true);
    expect(inScope(s, n("https://blog.onconcat.com/a"))).toBe(true);
    expect(inScope(s, n("https://notonconcat.com/a"))).toBe(false);
    expect(inScope(s, n("https://onconcat.com.evil.com/a"))).toBe(false);
  });

  it("URL-prefix limita host y ruta (con limite de segmento)", () => {
    const s = parseSite("https://www.onconcat.com/blog/")!;
    expect(s).toEqual({ host: "onconcat.com", kind: "prefix", pathPrefix: "/blog" });
    expect(inScope(s, n("https://onconcat.com/blog/x"))).toBe(true);
    expect(inScope(s, n("https://onconcat.com/blog"))).toBe(true);
    expect(inScope(s, n("https://onconcat.com/blogger"))).toBe(false);
    expect(inScope(s, n("https://blog.onconcat.com/blog/x"))).toBe(false);
    expect(inScope(parseSite("https://x.com/")!, n("https://x.com/anything"))).toBe(true);
  });

  it("entradas invalidas", () => {
    expect(parseSite("sc-domain:")).toBeNull();
    expect(parseSite("nope")).toBeNull();
  });
});
