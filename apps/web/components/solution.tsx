import { Fragment } from "react";
import type { Dictionary } from "@/dictionaries/es";
import { modules, type Phase } from "@/lib/modules";
import { PixelIcon } from "./pixel-icon";

const phases: Phase[] = ["A", "B", "C"];

function Flow({ dict }: { dict: Dictionary }) {
  const { flow, flowCaption } = dict.solution;
  const nodes = [
    { icon: "agent", label: flow.agent },
    { icon: "gateway", label: flow.gateway },
    { icon: "google", label: flow.google },
  ] as const;
  return (
    <figure className="flow">
      <div className="flow__row" aria-hidden="true">
        {nodes.map((node, i) => (
          <Fragment key={node.icon}>
            {i > 0 ? <span className="flow__wire" /> : null}
            <div className="flow__item">
              <div className={`flow__node${node.icon === "gateway" ? " flow__node--hot" : ""}`}>
                <PixelIcon name={node.icon} size={48} />
              </div>
              <span className="flow__label px">{node.label}</span>
            </div>
          </Fragment>
        ))}
      </div>
      <figcaption className="caption">
        {flow.agent} → {flow.gateway} → {flow.google}. {flowCaption}
      </figcaption>
    </figure>
  );
}

export function Solution({ dict }: { dict: Dictionary }) {
  const { solution } = dict;
  return (
    <section className="section" id="solution" aria-labelledby="solution-title">
      <div className="wrap">
        <div className="solution__top">
          <header className="sec-head">
            <p className="eyebrow">{solution.eyebrow}</p>
            <h2 id="solution-title" className="px h2">
              {solution.title}
            </h2>
            <p className="lead">{solution.sub}</p>
          </header>
          <Flow dict={dict} />
        </div>

        {phases.map((phase) => {
          const info = solution.phases[phase];
          return (
            <div key={phase} className={`phase phase--${phase}`}>
              <div className="phase__head">
                <h3 className="phase__name px">
                  <span className="chip">{info.label}</span>
                </h3>
                <p className="phase__status">{info.status}</p>
                <p className="phase__text">{info.text}</p>
              </div>
              <ul className="mods">
                {modules
                  .filter((m) => m.phase === phase)
                  .map((m) => (
                    <li key={m.id} className="mod">
                      <PixelIcon name={m.id} size={m.phase === "A" ? 40 : 32} className="mod__icon" />
                      <div className="mod__main">
                        <h4 className="mod__name">{solution.modules[m.id].name}</h4>
                        <p className="mod__extra">{solution.modules[m.id].extra}</p>
                        <p className="mod__scope">
                          <span>{solution.scopeLabel}</span> <code>{m.scope}</code>
                        </p>
                        {m.tools ? (
                          <ul className="mod__tools" aria-label={solution.toolsLabel}>
                            {m.tools.map((tool) => (
                              <li key={tool}>
                                <code>{tool}</code>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          );
        })}

        <div className="tasks">
          <div className="tasks__head">
            <span className="chip chip--outline">{solution.tasks.label}</span>
            <h3 className="px h3-px">{solution.tasks.title}</h3>
          </div>
          <ul className="tasks__list">
            {solution.tasks.items.map((task) => (
              <li key={task.name}>
                <code>{task.name}</code>
                <span>{task.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
