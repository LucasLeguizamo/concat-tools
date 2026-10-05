import type { ReactNode } from "react";
import { JetBrains_Mono, Silkscreen } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const pixel = Silkscreen({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-pixel", display: "swap" });

export const metadata = {
  title: "CONCAT Google Gateway",
  description: "Gateway MCP + CLI hacia Google (solo lectura).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${mono.variable} ${pixel.variable}`}>
      <body>{children}</body>
    </html>
  );
}
