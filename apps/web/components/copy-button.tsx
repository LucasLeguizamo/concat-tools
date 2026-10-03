"use client";

import { useEffect, useRef, useState } from "react";

type Labels = { copy: string; copied: string; copyFailed: string };

export function CopyButton({ text, labels }: { text: string; labels: Labels }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("ok");
    } catch {
      setState("fail");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2200);
  }

  return (
    <span className="copy">
      <button type="button" className="copy__btn" onClick={copy} data-state={state}>
        {state === "ok" ? labels.copied : state === "fail" ? labels.copyFailed : labels.copy}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "ok" ? labels.copied : state === "fail" ? labels.copyFailed : ""}
      </span>
    </span>
  );
}
