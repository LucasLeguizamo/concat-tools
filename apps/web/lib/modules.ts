import type { ModuleId } from "@/dictionaries/types";

export type Phase = "A" | "B" | "C";

export type ModuleMeta = {
  id: ModuleId;
  phase: Phase;
  /** Scope(s) de solo lectura de la spec (sin prefijo https://www.googleapis.com/auth/). */
  scope: string;
  /** Solo los modulos nativos de fase A muestran sus herramientas. */
  tools?: string[];
};

export const modules: ModuleMeta[] = [
  { id: "gsc", phase: "A", scope: "webmasters.readonly", tools: ["gsc_list_sites", "gsc_performance", "gsc_list_sitemaps"] },
  { id: "ga4", phase: "A", scope: "analytics.readonly", tools: ["ga4_list_properties", "ga4_daily_report"] },
  { id: "ads", phase: "A", scope: "adwords", tools: ["ads_list_customers", "ads_search"] },
  { id: "people", phase: "A", scope: "userinfo.profile" },
  { id: "calendar", phase: "B", scope: "calendar.events.readonly" },
  { id: "docs", phase: "B", scope: "documents.readonly" },
  { id: "sheets", phase: "B", scope: "spreadsheets.readonly" },
  { id: "slides", phase: "B", scope: "presentations.readonly" },
  { id: "gmail", phase: "C", scope: "gmail.readonly" },
  { id: "drive", phase: "C", scope: "drive.readonly" },
  { id: "chat", phase: "C", scope: "chat.messages.readonly" },
];
