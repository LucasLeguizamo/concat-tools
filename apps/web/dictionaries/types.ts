export type TermLine = {
  kind: "cmd" | "out" | "ok" | "err" | "warn" | "dim";
  text: string;
};

export type ModuleId =
  | "gsc"
  | "ga4"
  | "ads"
  | "people"
  | "calendar"
  | "docs"
  | "sheets"
  | "slides"
  | "gmail"
  | "drive"
  | "chat";

export type IconName =
  | ModuleId
  | "stack"
  | "dump"
  | "ghost"
  | "block"
  | "lock"
  | "unlock"
  | "arrow"
  | "plug"
  | "agent"
  | "gateway"
  | "google"
  | "logo"
  | "check"
  | "cross";

export type HowStep = {
  title: string;
  text: string;
  code?: string;
  output?: TermLine[];
  blocks?: { label: string; code: string }[];
};
