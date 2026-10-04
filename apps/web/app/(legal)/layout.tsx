import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { PixelIcon } from "@/components/pixel-icon";
import { getDictionary } from "@/dictionaries";
import { mono, pixel } from "@/lib/fonts";
import { SITE_URL } from "@/lib/site";
import "../globals.css";
import "../sections.css";
import "./legal.css";

// Root layout propio: las paginas legales solo existen en espanol y viven fuera de /[lang].
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { template: "%s | CONCAT", default: "CONCAT" },
};

export const viewport: Viewport = { themeColor: "#0a0c09", colorScheme: "dark" };

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const dict = getDictionary("es");
  return (
    <html lang="es" className={`${mono.variable} ${pixel.variable}`}>
      <body>
        <header className="nav">
          <div className="wrap nav__in">
            <Link className="logo" href="/es" aria-label="CONCAT Tools">
              <PixelIcon name="logo" size={28} className="logo__mark" />
              <span className="logo__word px">CONCAT</span>
              <span className="logo__tag">{dict.nav.tagline}</span>
            </Link>
          </div>
        </header>
        <main>{children}</main>
        <Footer dict={dict} />
      </body>
    </html>
  );
}
