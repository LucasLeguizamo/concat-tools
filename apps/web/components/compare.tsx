import type { Dictionary } from "@/dictionaries/es";
import { PixelIcon } from "./pixel-icon";
import { TermLines, TermWindow } from "./term-lines";

type Side = Dictionary["compare"]["bad"];

function Column({ side, tone }: { side: Side; tone: "bad" | "good" }) {
  return (
    <div className={`cmp__col cmp__col--${tone}`}>
      <h3 className="cmp__label px">{side.label}</h3>
      <TermWindow title={side.windowTitle} tone={tone}>
        <div className="term">
          <TermLines lines={side.lines} />
        </div>
      </TermWindow>
      <ul className="points">
        {side.points.map((point) => (
          <li key={point}>
            <PixelIcon name={tone === "bad" ? "cross" : "check"} size={16} />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Compare({ dict }: { dict: Dictionary }) {
  const { compare } = dict;
  return (
    <section className="section" id="demo" aria-labelledby="demo-title">
      <div className="wrap">
        <header className="sec-head">
          <p className="eyebrow">{compare.eyebrow}</p>
          <h2 id="demo-title" className="px h2">
            {compare.title}
          </h2>
          <p className="lead">{compare.sub}</p>
        </header>
        <div className="cmp">
          <Column side={compare.bad} tone="bad" />
          <Column side={compare.good} tone="good" />
        </div>
        <p className="note">{compare.note}</p>
      </div>
    </section>
  );
}
