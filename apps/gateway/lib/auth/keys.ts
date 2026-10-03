import { hkdfSync } from "node:crypto";
import { getEnv } from "../env";

/** Propositos de firma: una clave distinta por cada uno (un token de un proposito jamas valida en otro). */
export type KeyPurpose = "session" | "access" | "device-confirm" | "google-state" | "google-tx";

const cache = new Map<string, Uint8Array>();

/** HKDF-SHA256(JWT_SECRET, salt fijo, info = label). Determinista; memoizada por secreto+proposito. */
export function deriveKey(purpose: KeyPurpose): Uint8Array {
  const secret = getEnv().JWT_SECRET;
  const id = `${purpose}\0${secret}`;
  let key = cache.get(id);
  if (!key) {
    key = new Uint8Array(hkdfSync("sha256", secret, "concat-gateway/v1", purpose, 32));
    if (cache.size > 16) cache.clear();
    cache.set(id, key);
  }
  return key;
}
