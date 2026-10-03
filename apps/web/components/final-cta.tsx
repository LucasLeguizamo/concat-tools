import type { Dictionary } from "@/dictionaries/es";
import { GITHUB_URL, WAITLIST_URL } from "@/lib/site";

export function FinalCta({ dict }: { dict: Dictionary }) {
  const { cta, common } = dict;
  return (
    <section className="section cta" aria-labelledby="cta-title">
      <div className="wrap">
        <p className="eyebrow">{cta.eyebrow}</p>
        <h2 id="cta-title" className="px h2">
          {cta.title}
        </h2>
        <p className="cta__cmd" aria-hidden="true">
          <span className="tl__prompt">$ </span>
          {cta.command}
          <span className="cursor" />
        </p>
        <p className="lead">{cta.sub}</p>
        <div className="actions">
          <a className="btn btn--primary" href="#how">
            {cta.primary}
          </a>
          <a className="btn btn--amber" href={WAITLIST_URL}>
            {cta.secondary}
          </a>
          <a className="btn" href={GITHUB_URL}>
            {common.github}
          </a>
        </div>
      </div>
    </section>
  );
}
