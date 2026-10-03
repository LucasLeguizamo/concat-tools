import type { Dictionary } from "@/dictionaries/es";
import { PixelIcon } from "./pixel-icon";

export function Problem({ dict }: { dict: Dictionary }) {
  const { problem } = dict;
  return (
    <section className="section" id="problem" aria-labelledby="problem-title">
      <div className="wrap problem">
        <header className="sec-head problem__head">
          <p className="eyebrow">{problem.eyebrow}</p>
          <h2 id="problem-title" className="px h2">
            {problem.title}
          </h2>
        </header>
        <ol className="problem__list">
          {problem.items.map((item, i) => (
            <li key={item.title} className="problem__item">
              <span className="index px" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <PixelIcon name={item.icon} size={32} className="problem__icon" />
              <div>
                <h3 className="h3">{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
