export type SafeError = { status?: number; code?: string; message: string };

const MAX_MESSAGE = 500;

const REDACTED = "[REDACTED]";

const PATTERNS: Array<[RegExp, string]> = [
  [/"private_key"\s*:\s*"(?:[^"\\]|\\.)*"/gi, `"private_key":"${REDACTED}"`],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, REDACTED],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`],
  [/\bya29\.[A-Za-z0-9._-]+/g, REDACTED],
  [/\b1\/\/[A-Za-z0-9._-]+/g, REDACTED],
  // JWTs (tokens del gateway, id_tokens de Google).
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, REDACTED],
  // pares clave/valor de credenciales: JSON ("k":"v"), query/form (k=v).
  [
    /("?(?:refresh_token|access_token|id_token|client_secret|code_verifier)"?\s*[:=]\s*)("(?:[^"\\]|\\.)*"|[^\s&,}"]+)/gi,
    `$1"${REDACTED}"`,
  ],
];

export function redact(text: string): string {
  let out = text;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

const asRecord = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined;

function parseBody(data: unknown): Record<string, unknown> | undefined {
  if (typeof data === "string") {
    try {
      return asRecord(JSON.parse(data));
    } catch {
      return undefined;
    }
  }
  return asRecord(data);
}

/**
 * Convierte cualquier error (gaxios, fetch, Error, string) en un objeto seguro.
 * Allowlist estricta: SOLO status, code (reason) y message. Nunca se copia
 * config, headers, request, body ni el objeto original.
 */
export function toSafeError(err: unknown): SafeError {
  const e = asRecord(err);
  const response = asRecord(e?.response);
  const body = parseBody(response?.data);
  const gErr = asRecord(body?.error);
  const first = asRecord(Array.isArray(gErr?.errors) ? gErr.errors[0] : undefined);

  const statusRaw = response?.status ?? e?.status ?? gErr?.code ?? (typeof e?.code === "number" ? e.code : undefined);
  const status = typeof statusRaw === "number" && Number.isInteger(statusRaw) ? statusRaw : undefined;

  const codeRaw =
    first?.reason ??
    gErr?.status ??
    (typeof body?.error === "string" ? body.error : undefined) ?? // OAuth: invalid_grant
    e?.reason ??
    (typeof e?.code === "string" ? e.code : undefined);
  const code = typeof codeRaw === "string" && /^[\w.:-]{1,100}$/.test(codeRaw) ? codeRaw : undefined;

  const messageRaw =
    (typeof gErr?.message === "string" ? gErr.message : undefined) ??
    (typeof body?.error_description === "string" ? body.error_description : undefined) ??
    (typeof e?.message === "string" ? e.message : undefined) ??
    (typeof err === "string" ? err : undefined) ??
    "Error desconocido";

  let message = redact(messageRaw);
  if (message.length > MAX_MESSAGE) message = `${message.slice(0, MAX_MESSAGE)}…`;

  const out: SafeError = { message };
  if (status !== undefined) out.status = status;
  if (code !== undefined) out.code = code;
  return out;
}
