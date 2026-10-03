import type { Dictionary } from "@/dictionaries/es";
import { GITHUB_URL } from "@/lib/site";

export function Footer({ dict }: { dict: Dictionary }) {
  const { footer, common } = dict;
  return (
    <footer className="footer">
      <div className="wrap footer__in">
        <p className="footer__copy">{footer.copy}</p>
        <nav className="footer__links" aria-label="Footer">
          <a href={GITHUB_URL}>{common.github}</a>
          <a href="#">{footer.privacy}</a>
          <a href="#">{footer.terms}</a>
        </nav>
        <p className="footer__legal">{footer.disclaimer}</p>
      </div>
    </footer>
  );
}
