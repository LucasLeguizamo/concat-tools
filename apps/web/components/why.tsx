import type { Dictionary } from "@/dictionaries/es";
import { PixelIcon } from "./pixel-icon";

export function Why({ dict }: { dict: Dictionary }) {
  const { why } = dict;
  return (
    <section className="section" id="why" aria-labelledby="why-title">
      <div className="wrap">
        <header className="sec-head">
          <p className="eyebrow">{why.eyebrow}</p>
          <h2 id="why-title" className="px h2">
            {why.title}
          </h2>
        </header>
        <ul className="why">
          {why.items.map((item, i) => (
            <li key={item.title} className="why__item">
              <div className="why__top">
                <PixelIcon name={item.icon} size={40} className="why__icon" />
                <span className="index px" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="h3">{item.title}</h3>
              <p>{item.text}</p>
              <code className="proof">{item.proof}</code>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
