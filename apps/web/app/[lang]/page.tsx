import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/dictionaries";
import { SITE_URL } from "@/lib/site";
import { Compare } from "@/components/compare";
import { FinalCta } from "@/components/final-cta";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { How } from "@/components/how";
import { Nav } from "@/components/nav";
import { Pricing } from "@/components/pricing";
import { Problem } from "@/components/problem";
import { Solution } from "@/components/solution";
import { Why } from "@/components/why";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "CONCAT Tools",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    inLanguage: lang,
    description: dict.meta.description,
    license: "https://opensource.org/licenses/MIT",
    url: `${SITE_URL}/${lang}`,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: dict.pricing.selfHost.name },
  };

  return (
    <>
      <a className="skip" href="#main">
        {dict.common.skip}
      </a>
      <Nav lang={lang} dict={dict} />
      <main id="main">
        <Hero dict={dict} />
        <Compare dict={dict} />
        <Problem dict={dict} />
        <Solution dict={dict} />
        <How dict={dict} />
        <Why dict={dict} />
        <Pricing dict={dict} />
        <FinalCta dict={dict} />
      </main>
      <Footer dict={dict} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
