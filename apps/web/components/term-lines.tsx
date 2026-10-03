import type { TermLine } from "@/dictionaries/types";

export function TermRow({ kind, text }: TermLine) {
  return (
    <div className={`tl tl--${kind}`}>
      {kind === "cmd" ? <span className="tl__prompt" aria-hidden="true">$ </span> : null}
      {text}
    </div>
  );
}

export function TermLines({ lines }: { lines: TermLine[] }) {
  return lines.map((line, i) => <TermRow key={i} {...line} />);
}

export function TermWindow({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "bad" | "good" }) {
  return (
    <div className={`win${tone ? ` win--${tone}` : ""}`}>
      <div className="win__bar" aria-hidden="true">
        <span className="win__dots">
          <i />
          <i />
          <i />
        </span>
        <span className="win__title">{title}</span>
      </div>
      <div className="win__body">{children}</div>
    </div>
  );
}
