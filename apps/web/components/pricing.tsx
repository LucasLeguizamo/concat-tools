import type { Dictionary } from "@/dictionaries/es";
import { GITHUB_URL, WAITLIST_URL } from "@/lib/site";
import { TermWindow } from "./term-lines";

type Plan = Dictionary["pricing"]["selfHost"];

function PlanCard({ plan, slug, href, tone }: { plan: Plan; slug: string; href: string; tone: "free" | "beta" }) {
  return (
    <article className={`plan plan--${tone}`}>
      <TermWindow title={`~/pricing/${slug}`}>
        <h3 className="plan__name">{plan.name}</h3>
        <p className="plan__price px">{plan.price}</p>
        <p className={`chip${tone === "beta" ? " chip--amber" : ""}`}>{plan.tag}</p>
        <ul className="plan__list">
          {plan.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
        <a className={`btn${tone === "free" ? "" : " btn--primary"}`} href={href}>
          {plan.cta}
        </a>
      </TermWindow>
    </article>
  );
}

export function Pricing({ dict }: { dict: Dictionary }) {
  const { pricing } = dict;
  return (
    <section className="section" id="pricing" aria-labelledby="pricing-title">
      <div className="wrap">
        <header className="sec-head">
          <p className="eyebrow">{pricing.eyebrow}</p>
          <h2 id="pricing-title" className="px h2">
            {pricing.title}
          </h2>
        </header>
        <div className="plans">
          <PlanCard plan={pricing.selfHost} slug="self-host" href={GITHUB_URL} tone="free" />
          <PlanCard plan={pricing.hosted} slug="hosted" href={WAITLIST_URL} tone="beta" />
        </div>
      </div>
    </section>
  );
}
