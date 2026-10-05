import { describe, expect, it } from "vitest";
import type { ModuleStatusEntry } from "../../lib/connection";
import { en, es } from "../../lib/copy";
import { bannerFor, byUrgency, hintFor } from "./view";

const entry = (id: string, status: ModuleStatusEntry["status"], extra: Partial<ModuleStatusEntry> = {}) =>
  ({ id, status, last_probe_at: null, resource_count: null, last_error: null, connect_url: "#", beta: false, action: null, ...extra }) as ModuleStatusEntry;

describe("dashboard: avisos", () => {
  const statuses = [entry("gsc", "connected", { resource_count: 3 }), entry("ga4", "no_resources", { last_error: "Sin propiedades." })];

  it("un fallo al desconectar NO muestra a la vez el aviso de verificado", () => {
    const b = bannerFor({ error: "disconnect_failed", failed: "gsc", module: "gsc" }, statuses);
    expect(b).toMatchObject({ tone: "error" });
    expect(b?.body).toContain("Search Console");
  });

  it("error desconocido o modulo inventado => mensaje generico, sin eco del parametro", () => {
    expect(bannerFor({ error: "x", failed: "<script>" }, statuses)?.body).not.toContain("<script>");
  });

  it("tras conectar: ok con recursos y vuelta a la terminal; si no quedo conectado, aviso con el motivo", () => {
    expect(bannerFor({ module: "gsc" }, statuses)).toMatchObject({ tone: "ok", title: "Search Console conectado" });
    expect(bannerFor({ module: "gsc" }, statuses)).toMatchObject({ done: true });
    expect(bannerFor({ module: "ga4" }, statuses)).toMatchObject({ tone: "warn", body: "Sin propiedades." });
    expect(bannerFor({ module: "nope" }, statuses)).toBeNull();
  });

  it("volver de Google sin conectar => 'no se completo', nunca un aviso vacio", () => {
    const b = bannerFor({ module: "ads" }, [...statuses, entry("ads", "not_connected")]);
    expect(b).toMatchObject({ tone: "warn", title: "Google Ads: la conexión no se completó" });
    expect(b?.body).not.toBe("");
  });

  it("errores de 'volver a comprobar' nombran el modulo", () => {
    expect(bannerFor({ error: "rate_limited", failed: "ga4" }, statuses)?.body).toContain("Analytics 4");
    expect(bannerFor({ checked: "ga4" }, statuses)).toMatchObject({ tone: "warn", body: "Sin propiedades." });
  });

  it("orden por urgencia: permiso perdido primero, no conectados al final", () => {
    const sorted = [entry("a", "not_connected"), entry("b", "connected"), entry("c", "scope_lost"), entry("d", "authorized")].sort(byUrgency);
    expect(sorted.map((s) => s.id)).toEqual(["c", "d", "b", "a"]);
  });

  it("pistas localizadas: en EN no se filtra el last_error del servidor (espanol); en ES si, por ser mas especifico", () => {
    const ga4 = entry("ga4", "no_resources", { last_error: "Tu cuenta no ve ninguna propiedad." });
    expect(hintFor(ga4, es)).toBe("Tu cuenta no ve ninguna propiedad.");
    expect(hintFor(ga4, en)).toContain("Viewer role");
    expect(hintFor(entry("gsc", "connected"), en)).toBeNull();
    expect(bannerFor({ checked: "ga4" }, [ga4], en)?.body).toContain("Viewer role");
  });
});
