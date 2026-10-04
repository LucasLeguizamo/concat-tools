import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, locales } from "@/dictionaries";
import { mono, pixel } from "@/lib/fonts";
import { GITHUB_URL, SITE_URL } from "@/lib/site";
import "../globals.css";
import "../sections.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export const viewport: Viewport = {
  themeColor: "#0a0c09",
  colorScheme: "dark",
};

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const { meta } = getDictionary(lang);
  return {
    metadataBase: new URL(SITE_URL),
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: `/${lang}`,
      languages: { es: "/es", en: "/en", "x-default": "/es" },
    },
    openGraph: {
      type: "website",
      siteName: "CONCAT Tools",
      title: meta.title,
      description: meta.description,
      url: `/${lang}`,
      locale: meta.ogLocale,
      alternateLocale: locales.filter((l) => l !== lang).map((l) => getDictionary(l).meta.ogLocale),
    },
    twitter: { card: "summary_large_image", title: meta.title, description: meta.description },
    authors: [{ name: "CONCAT", url: GITHUB_URL }],
  };
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <html lang={lang} className={`${mono.variable} ${pixel.variable}`}>
      <body>{children}</body>
    </html>
  );
}
