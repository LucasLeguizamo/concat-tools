import type { ReactNode } from "react";
import { JetBrains_Mono, Silkscreen } from "next/font/google";
import { getT } from "../lib/i18n";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const pixel = Silkscreen({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-pixel", display: "swap" });

export const metadata = {
  title: { default: "CONCAT Google Gateway", template: "%s · CONCAT Gateway" },
  description: "Gateway MCP + CLI hacia Google (solo lectura).",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const t = await getT();
  return (
    <html lang={t.lang} className={`${mono.variable} ${pixel.variable}`}>
      <body>{children}</body>
    </html>
  );
}
