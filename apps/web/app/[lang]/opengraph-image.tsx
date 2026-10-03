import { ImageResponse } from "next/og";
import { getDictionary, isLocale, locales } from "@/dictionaries";

export const alt = "CONCAT Tools";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = getDictionary(isLocale(lang) ? lang : "es");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0a0c09",
          color: "#d9e4d2",
          fontFamily: "monospace",
          border: "8px solid #33452d",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, letterSpacing: 6, color: "#7ee26b" }}>CONCAT TOOLS</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 68, fontWeight: 700, lineHeight: 1.15 }}>
          <div style={{ display: "flex" }}>{dict.hero.titleMain}</div>
          <div style={{ display: "flex", color: "#7ee26b" }}>{dict.hero.titleAccent}</div>
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#93a38b" }}>$ npx @concat/cli login</div>
      </div>
    ),
    size,
  );
}
