import Link from "next/link";
import type { Dictionary } from "@/dictionaries/es";
import { locales, type Locale } from "@/dictionaries";
import { GITHUB_URL } from "@/lib/site";
import { PixelIcon } from "./pixel-icon";

const anchors = ["problem", "solution", "how", "why", "pricing"] as const;

export function Nav({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const { nav, common } = dict;
  return (
    <header className="nav">
      <div className="wrap nav__in">
        <Link className="logo" href={`/${lang}`} aria-label="CONCAT Tools">
          <PixelIcon name="logo" size={28} className="logo__mark" />
          <span className="logo__word px">CONCAT</span>
          <span className="logo__tag">{nav.tagline}</span>
        </Link>
        <nav className="nav__links" aria-label={nav.label}>
          {anchors.map((id) => (
            <a key={id} href={`#${id}`}>
              {nav.links[id]}
            </a>
          ))}
        </nav>
        <div className="nav__right">
          <a className="nav__gh" href={GITHUB_URL}>
            {common.github}
          </a>
          <ul className="lang" aria-label={nav.langLabel}>
            {locales.map((l) => (
              <li key={l}>
                <Link href={`/${l}`} hrefLang={l} lang={l} aria-current={l === lang ? "true" : undefined}>
                  {l.toUpperCase()}
                </Link>
              </li>
            ))}
          </ul>
          <a className="btn btn--sm btn--primary nav__cta" href="#how">
            {nav.cta}
          </a>
        </div>
      </div>
    </header>
  );
}
