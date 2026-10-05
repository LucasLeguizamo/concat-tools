import { getDb } from "../db";

export type PendingAuth = {
  id: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  state: string | null;
  expiresAt: Date;
  /** IP de quien llamo a /oauth/authorize (tope de pendientes por IP). */
  ip: string;
};

export type CodeRecord = {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  expiresAt: Date;
};

export type RefreshRecord = {
  userId: string;
  clientId: string;
  scope: string;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Un login = una familia; la reutilizacion de un token fuera de gracia revoca solo la familia. */
  familyId: string;
  /** Vida absoluta de la familia: NO se reinicia al rotar. */
  familyExpiresAt: Date;
  /** Fecha de rotacion normal (elegible para ventana de gracia). null si no fue rotado o se revoco a proposito. */
  rotatedAt: Date | null;
};

export type DeviceRecord = {
  userCode: string;
  userId: string | null;
  clientId: string;
  scope: string;
  expiresAt: Date;
  lastPolledAt: Date | null;
  /** Quien inicio el flujo (se muestra en la pantalla de aprobacion). */
  createdAt: Date;
  initIp: string | null;
  initCountry: string | null;
  /** El usuario lo denego en /device; el proximo poll recibe access_denied. */
  deniedAt?: Date | null;
};

/**
 * Persistencia de la capa A. Todas las operaciones "take"/"consume" son atomicas
 * (un solo statement) para que un code/refresh/device code sea de un solo uso
 * aun con requests concurrentes.
 */
export interface OAuthStore {
  insertPending(p: Omit<PendingAuth, "id">): Promise<string>;
  /** Pendientes vigentes (tope anti-llenado), por client_id o por IP. */
  countPending(by: { clientId: string } | { ip: string }, now: Date): Promise<number>;
  getPending(id: string, now: Date): Promise<PendingAuth | null>;
  takePending(id: string, now: Date): Promise<PendingAuth | null>;

  insertCode(hash: string, rec: CodeRecord): Promise<void>;
  takeCode(hash: string): Promise<CodeRecord | null>;

  insertRefresh(hash: string, rec: Omit<RefreshRecord, "revokedAt" | "rotatedAt">): Promise<void>;
  findRefresh(hash: string): Promise<RefreshRecord | null>;
  /** Marca rotado+revocado SOLO si estaba activo. null = ya revocado/expirado/inexistente. */
  consumeRefresh(hash: string, now: Date): Promise<RefreshRecord | null>;
  /** Revoca toda la familia (reuso fuera de gracia, o revoke explicito); anula la elegibilidad de gracia. */
  revokeFamily(familyId: string, now: Date): Promise<void>;

  /** false si user_code ya existe (colision). */
  insertDevice(hash: string, rec: Omit<DeviceRecord, "userId" | "lastPolledAt" | "createdAt">): Promise<boolean>;
  /** Device codes pendientes (sin aprobar) y vigentes, por client_id o por IP de origen. */
  countPendingDevices(by: { clientId: string } | { ip: string }, now: Date): Promise<number>;
  getDeviceByUserCode(userCode: string, now: Date): Promise<DeviceRecord | null>;
  getDevice(hash: string): Promise<DeviceRecord | null>;
  approveDevice(userCode: string, userId: string, now: Date): Promise<boolean>;
  /** Marca como denegado un device code pendiente; false si ya no estaba pendiente. */
  denyDevice(userCode: string, now: Date): Promise<boolean>;
  touchDevice(hash: string, now: Date): Promise<void>;
  deleteDevice(hash: string): Promise<void>;
  /** Borra y devuelve el device code solo si ya fue aprobado. */
  takeApprovedDevice(hash: string): Promise<DeviceRecord | null>;
}

type PendingRow = {
  id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  state: string | null;
  expires_at: Date;
  ip: string | null;
};
type CodeRow = Omit<PendingRow, "id" | "state" | "ip"> & { user_id: string };
type RefreshRow = {
  user_id: string;
  client_id: string;
  scope: string;
  expires_at: Date;
  revoked_at: Date | null;
  family_id: string;
  family_expires_at: Date;
  rotated_at: Date | null;
};
type DeviceRow = {
  user_code: string;
  user_id: string | null;
  client_id: string;
  scope: string;
  expires_at: Date;
  last_polled_at: Date | null;
  created_at: Date;
  init_ip: string | null;
  init_country: string | null;
  denied_at?: Date | null;
};

const toPending = (r: PendingRow): PendingAuth => ({
  id: r.id,
  clientId: r.client_id,
  redirectUri: r.redirect_uri,
  codeChallenge: r.code_challenge,
  scope: r.scope,
  state: r.state,
  expiresAt: r.expires_at,
  ip: r.ip ?? "unknown",
});
const toCode = (r: CodeRow): CodeRecord => ({
  clientId: r.client_id,
  userId: r.user_id,
  redirectUri: r.redirect_uri,
  codeChallenge: r.code_challenge,
  scope: r.scope,
  expiresAt: r.expires_at,
});
const toRefresh = (r: RefreshRow): RefreshRecord => ({
  userId: r.user_id,
  clientId: r.client_id,
  scope: r.scope,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
  familyId: r.family_id,
  familyExpiresAt: r.family_expires_at,
  rotatedAt: r.rotated_at,
});
const toDevice = (r: DeviceRow): DeviceRecord => ({
  userCode: r.user_code,
  userId: r.user_id,
  clientId: r.client_id,
  scope: r.scope,
  expiresAt: r.expires_at,
  lastPolledAt: r.last_polled_at,
  createdAt: r.created_at,
  initIp: r.init_ip,
  initCountry: r.init_country,
  deniedAt: r.denied_at ?? null,
});

export function createPgStore(): OAuthStore {
  const sql = () => getDb();
  return {
    async insertPending(p) {
      const db = sql();
      await db`DELETE FROM pending_auth WHERE expires_at < now()`;
      const rows = await db<{ id: string }[]>`
        INSERT INTO pending_auth (client_id, redirect_uri, code_challenge, scope, state, expires_at, ip)
        VALUES (${p.clientId}, ${p.redirectUri}, ${p.codeChallenge}, ${p.scope}, ${p.state}, ${p.expiresAt}, ${p.ip})
        RETURNING id`;
      return rows[0]!.id;
    },
    async countPending(by, now) {
      const rows =
        "clientId" in by
          ? await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM pending_auth WHERE client_id = ${by.clientId} AND expires_at > ${now}`
          : await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM pending_auth WHERE ip = ${by.ip} AND expires_at > ${now}`;
      return rows[0]?.n ?? 0;
    },
    async getPending(id, now) {
      const rows = await sql()<PendingRow[]>`
        SELECT * FROM pending_auth WHERE id = ${id} AND expires_at > ${now}`;
      return rows[0] ? toPending(rows[0]) : null;
    },
    async takePending(id, now) {
      const rows = await sql()<PendingRow[]>`
        DELETE FROM pending_auth WHERE id = ${id} AND expires_at > ${now} RETURNING *`;
      return rows[0] ? toPending(rows[0]) : null;
    },

    async insertCode(hash, r) {
      const db = sql();
      await db`DELETE FROM oauth_codes WHERE expires_at < now()`;
      await db`
        INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, expires_at)
        VALUES (${hash}, ${r.clientId}, ${r.userId}, ${r.redirectUri}, ${r.codeChallenge}, ${r.scope}, ${r.expiresAt})`;
    },
    async takeCode(hash) {
      const rows = await sql()<CodeRow[]>`DELETE FROM oauth_codes WHERE code_hash = ${hash} RETURNING *`;
      return rows[0] ? toCode(rows[0]) : null;
    },

    async insertRefresh(hash, r) {
      await sql()`
        INSERT INTO gateway_tokens (refresh_hash, user_id, client_id, scope, expires_at, family_id, family_expires_at)
        VALUES (${hash}, ${r.userId}, ${r.clientId}, ${r.scope}, ${r.expiresAt}, ${r.familyId}, ${r.familyExpiresAt})`;
    },
    async findRefresh(hash) {
      const rows = await sql()<RefreshRow[]>`SELECT * FROM gateway_tokens WHERE refresh_hash = ${hash}`;
      return rows[0] ? toRefresh(rows[0]) : null;
    },
    async consumeRefresh(hash, now) {
      const rows = await sql()<RefreshRow[]>`
        UPDATE gateway_tokens SET revoked_at = ${now}, rotated_at = ${now}
        WHERE refresh_hash = ${hash} AND revoked_at IS NULL AND expires_at > ${now}
        RETURNING *`;
      return rows[0] ? toRefresh(rows[0]) : null;
    },
    async revokeFamily(familyId, now) {
      await sql()`
        UPDATE gateway_tokens SET revoked_at = COALESCE(revoked_at, ${now}), rotated_at = NULL
        WHERE family_id = ${familyId}`;
    },

    async insertDevice(hash, r) {
      const db = sql();
      await db`DELETE FROM device_codes WHERE expires_at < now()`;
      const rows = await db`
        INSERT INTO device_codes (device_code_hash, user_code, client_id, scope, expires_at, init_ip, init_country)
        VALUES (${hash}, ${r.userCode}, ${r.clientId}, ${r.scope}, ${r.expiresAt}, ${r.initIp}, ${r.initCountry})
        ON CONFLICT DO NOTHING RETURNING device_code_hash`;
      return rows.length === 1;
    },
    async countPendingDevices(by, now) {
      const rows =
        "clientId" in by
          ? await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM device_codes WHERE client_id = ${by.clientId} AND user_id IS NULL AND expires_at > ${now}`
          : await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM device_codes WHERE init_ip = ${by.ip} AND user_id IS NULL AND expires_at > ${now}`;
      return rows[0]?.n ?? 0;
    },
    async getDeviceByUserCode(userCode, now) {
      const rows = await sql()<DeviceRow[]>`
        SELECT * FROM device_codes WHERE user_code = ${userCode} AND expires_at > ${now} AND denied_at IS NULL`;
      return rows[0] ? toDevice(rows[0]) : null;
    },
    async getDevice(hash) {
      const rows = await sql()<DeviceRow[]>`SELECT * FROM device_codes WHERE device_code_hash = ${hash}`;
      return rows[0] ? toDevice(rows[0]) : null;
    },
    async approveDevice(userCode, userId, now) {
      const rows = await sql()`
        UPDATE device_codes SET user_id = ${userId}
        WHERE user_code = ${userCode} AND user_id IS NULL AND denied_at IS NULL AND expires_at > ${now}
        RETURNING user_code`;
      return rows.length === 1;
    },
    async denyDevice(userCode, now) {
      const rows = await sql()`
        UPDATE device_codes SET denied_at = ${now}
        WHERE user_code = ${userCode} AND user_id IS NULL AND denied_at IS NULL AND expires_at > ${now}
        RETURNING user_code`;
      return rows.length === 1;
    },
    async touchDevice(hash, now) {
      await sql()`UPDATE device_codes SET last_polled_at = ${now} WHERE device_code_hash = ${hash}`;
    },
    async deleteDevice(hash) {
      await sql()`DELETE FROM device_codes WHERE device_code_hash = ${hash}`;
    },
    async takeApprovedDevice(hash) {
      const rows = await sql()<DeviceRow[]>`
        DELETE FROM device_codes WHERE device_code_hash = ${hash} AND user_id IS NOT NULL RETURNING *`;
      return rows[0] ? toDevice(rows[0]) : null;
    },
  };
}
