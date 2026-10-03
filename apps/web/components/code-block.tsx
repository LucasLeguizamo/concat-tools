import { CopyButton } from "./copy-button";

type Labels = { copy: string; copied: string; copyFailed: string };

export function CodeBlock({ label, code, labels, shell = true }: { label: string; code: string; labels: Labels; shell?: boolean }) {
  return (
    <div className="code">
      <div className="code__bar">
        <span className="code__label">{label}</span>
        <CopyButton text={code} labels={labels} />
      </div>
      <pre className={shell ? "code__pre code__pre--sh" : "code__pre"} tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
