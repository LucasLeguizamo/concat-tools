import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEnv, parseVaultKeys, type VaultKey } from "./env";

// ponytail: la clave vive en env (VAULT_KEYS) con rotacion manual por version.
// Upgrade path: envelope encryption con KMS (Google Cloud KMS): una DEK por
// registro/usuario cifrada por la KEK en KMS; `keyVersion` pasaria a identificar
// la version de la KEK y la DEK envuelta se guardaria junto al registro.

export type Sealed = { ct: Buffer; nonce: Buffer; keyVersion: string };

const ALGO = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export function createVault(keyring: VaultKey[]) {
  const active = keyring[keyring.length - 1];
  if (!active) throw new Error("keyring vacio");
  const byVersion = new Map(keyring.map((k) => [k.version, k.key]));

  return {
    /** `aad` (p. ej. userId) liga el cifrado a su fila: copiar ct entre usuarios falla al descifrar. */
    encrypt(plain: string, aad?: string): Sealed {
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv(ALGO, active.key, nonce);
      if (aad !== undefined) cipher.setAAD(Buffer.from(aad, "utf8"));
      const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      // ct = ciphertext || tag(16)
      return { ct: Buffer.concat([body, cipher.getAuthTag()]), nonce, keyVersion: active.version };
    },
    decrypt(sealed: Sealed, aad?: string): string {
      const key = byVersion.get(sealed.keyVersion);
      if (!key) throw new Error(`vault: version de clave desconocida ${sealed.keyVersion}`);
      if (sealed.ct.length < TAG_BYTES) throw new Error("vault: ciphertext invalido");
      const body = sealed.ct.subarray(0, sealed.ct.length - TAG_BYTES);
      const tag = sealed.ct.subarray(sealed.ct.length - TAG_BYTES);
      const decipher = createDecipheriv(ALGO, key, sealed.nonce);
      if (aad !== undefined) decipher.setAAD(Buffer.from(aad, "utf8"));
      decipher.setAuthTag(tag);
      try {
        return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
      } catch {
        // Mensaje fijo: no filtrar detalles del fallo criptografico.
        throw new Error("vault: no se pudo descifrar (clave, nonce o aad incorrectos)");
      }
    },
  };
}

let cached: ReturnType<typeof createVault> | undefined;
function vault() {
  return (cached ??= createVault(parseVaultKeys(getEnv().VAULT_KEYS)));
}

export function encrypt(plain: string, aad?: string): Sealed {
  return vault().encrypt(plain, aad);
}

export function decrypt(sealed: Sealed, aad?: string): string {
  return vault().decrypt(sealed, aad);
}

/** True si el registro usa una clave que ya no es la activa (candidato a re-cifrado). */
export function needsRotation(keyVersion: string): boolean {
  const ring = parseVaultKeys(getEnv().VAULT_KEYS);
  return ring[ring.length - 1]?.version !== keyVersion;
}
