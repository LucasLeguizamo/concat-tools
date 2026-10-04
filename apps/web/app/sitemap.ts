import type { MetadataRoute } from "next";
import { locales } from "@/dictionaries";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(locales.map((l) => [l, `${SITE_URL}/${l}`]));
  return [
    ...locales.map((l) => ({
      url: `${SITE_URL}/${l}`,
      changeFrequency: "monthly" as const,
      priority: l === "es" ? 1 : 0.9,
      alternates: { languages },
    })),
    ...["/privacidad", "/terminos"].map((path) => ({ url: `${SITE_URL}${path}`, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
