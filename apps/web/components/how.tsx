import type { Dictionary } from "@/dictionaries/es";
import { CodeBlock } from "./code-block";
import { TermLines, TermWindow } from "./term-lines";

export function How({ dict }: { dict: Dictionary }) {
  const { how, common } = dict;
  const labels = { copy: common.copy, copied: common.copied, copyFailed: common.copyFailed };
  return (
    <section className="section" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <header className="sec-head">
          <p className="eyebrow">{how.eyebrow}</p>
          <h2 id="how-title" className="px h2">
            {how.title}
          </h2>
        </header>
        <ol className="steps">
          {how.steps.map((step, i) => (
            <li key={step.title} className="step">
              <span className="step__n px" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="step__text">
                <h3 className="h3">{step.title}</h3>
                <p>{step.text}</p>
              </div>
              <div className="step__code">
                {step.code ? <CodeBlock label="shell" code={step.code} labels={labels} /> : null}
                {step.output ? (
                  <TermWindow title="concat status">
                    <div className="term">
                      <TermLines lines={step.output} />
                    </div>
                  </TermWindow>
                ) : null}
                {step.blocks
                  ? step.blocks.map((block) => (
                      <CodeBlock key={block.label} label={block.label} code={block.code} labels={labels} shell={!block.code.startsWith("{")} />
                    ))
                  : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
