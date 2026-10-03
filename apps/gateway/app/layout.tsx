import type { ReactNode } from "react";

export const metadata = {
  title: "CONCAT Google Gateway",
  description: "Gateway MCP + CLI hacia Google (solo lectura).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
