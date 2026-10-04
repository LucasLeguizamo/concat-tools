import type React from "react";
import { legal } from "@/lib/legal";

type Section = { id: string; title: string; body: React.ReactNode };

const num = (i: number) => String(i + 1).padStart(2, "0");

export function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: React.ReactNode;
  sections: Section[];
}) {
  return (
    <article className="wrap legal">
      <header className="legal__head">
        <p className="legal__eyebrow">$ cat {eyebrow}</p>
        <h1 className="legal__title">{title}</h1>
        <p className="legal__date">
          Vigente desde el <time dateTime={legal.vigenciaISO}>{legal.vigencia}</time>
        </p>
        <div className="legal__intro">{intro}</div>
      </header>
      <div className="legal__grid">
        <nav aria-label="Contenido" className="legal__toc">
          <ol>
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>
                  {num(i)} {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="legal__sections">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id}>
              <h2>
                <span className="legal__num">{num(i)}</span>
                {s.title}
              </h2>
              <div className="legal-body">{s.body}</div>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
