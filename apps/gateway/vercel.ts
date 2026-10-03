import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  // Chequeo diario de salud (spec §6). Vercel envia `Authorization: Bearer $CRON_SECRET`.
  crons: [{ path: "/api/cron/health", schedule: "0 6 * * *" }],
};
