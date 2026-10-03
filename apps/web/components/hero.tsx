import type { Dictionary } from "@/dictionaries/es";
import { GITHUB_URL } from "@/lib/site";
import { TerminalDemo } from "./terminal-demo";

export function Hero({ dict }: { dict: Dictionary }) {
  const { hero, common } = dict;
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap hero__grid">
        <div className="hero__copy">
          <p className="eyebrow">
            <span className="status-dot" aria-hidden="true" />
            {hero.eyebrow}
          </p>
          <h1 id="hero-title" className="px hero__title">
            {hero.titleMain} <span className="hl">{hero.titleAccent}</span>
            <span className="cursor cursor--h1" aria-hidden="true" />
          </h1>
          <p className="lead">{hero.sub}</p>
          <div className="actions">
            <a className="btn btn--primary" href="#how">
              {hero.ctaPrimary}
            </a>
            <a className="btn" href={GITHUB_URL}>
              {hero.ctaSecondary}
            </a>
          </div>
        </div>
        <div className="hero__term">
          <TerminalDemo lines={hero.terminal} title={hero.terminalTitle} label={hero.terminalLabel} />
          <p className="caption">{common.exampleData}</p>
        </div>
      </div>
      <ul className="wrap facts" aria-label="Stack">
        {hero.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </section>
  );
}
