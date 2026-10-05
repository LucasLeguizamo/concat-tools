import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveClient } from "../../lib/auth/clients";
import { enterUserCode } from "../../lib/auth/device-entry";
import { oauthServer } from "../../lib/auth/oauth-server";
import {
  cookieOptions,
  DEVICE_CONFIRM_TTL_S,
  deviceConfirmCookieName,
  getSessionUser,
  signDeviceConfirm,
  verifyDeviceConfirm,
} from "../../lib/auth/session";
import { SubmitButton } from "../../lib/auth/client-ui";
import { button, Done, Identity, Notice, Shell, SwitchAccount } from "../../lib/auth/ui";
import type { Copy } from "../../lib/copy";
import { getT } from "../../lib/i18n";
import { rateLimiter } from "../../lib/rate-limit";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getT()).device.title };
}

// Anti-phishing de device code: el codigo SIEMPRE lo teclea el usuario (esta pagina ignora `?code=`),
// y la pantalla de aprobacion muestra quien y desde donde inicio el flujo.

/** El codigo viaja por POST (server action), nunca por la URL. */
async function submitCode(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fdevice");
  const userCode = await enterUserCode(
    { userId: user.id, input: String(formData.get("code") ?? "") },
    { limiter: rateLimiter(), server: oauthServer() },
  );
  if (!userCode) redirect("/device?error=1");
  (await cookies()).set(
    deviceConfirmCookieName(),
    await signDeviceConfirm(user.id, userCode),
    cookieOptions(DEVICE_CONFIRM_TTL_S),
  );
  redirect("/device");
}

async function approve() {
  "use server";
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fdevice");
  const jar = await cookies();
  const token = jar.get(deviceConfirmCookieName())?.value;
  const userCode = token ? await verifyDeviceConfirm(token, user.id) : null;
  jar.set(deviceConfirmCookieName(), "", cookieOptions(0));
  if (!userCode) redirect("/device?error=1");
  const ok = await oauthServer().approveDevice(userCode, user.id);
  redirect(ok ? "/device?done=1" : "/device?error=1");
}

/** Denegar invalida el codigo de verdad: el siguiente poll de la CLI recibe access_denied (RFC 8628). */
async function cancel() {
  "use server";
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fdevice");
  const jar = await cookies();
  const token = jar.get(deviceConfirmCookieName())?.value;
  const userCode = token ? await verifyDeviceConfirm(token, user.id) : null;
  jar.set(deviceConfirmCookieName(), "", cookieOptions(0));
  if (userCode) await oauthServer().denyDevice(userCode);
  redirect(userCode ? "/device?denied=1" : "/device");
}

function CodeForm({ error, t }: { error: boolean; t: Copy }) {
  return (
    <form action={submitCode} className="codeform">
      <label htmlFor="code" className="label">
        {t.device.codeLabel}
      </label>
      <div className="actions actions--tight">
        <input
          id="code"
          name="code"
          placeholder="ABCD-EFGH"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          required
          aria-invalid={error || undefined}
          aria-describedby="code-help"
          className="input"
        />
        <SubmitButton className={button} pending={t.device.continue}>
          {t.device.continue}
        </SubmitButton>
      </div>
      <p id="code-help" className="help">
        {t.device.codeHelp}
      </p>
    </form>
  );
}

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; denied?: string; error?: string }>;
}) {
  // `?code=` se ignora a proposito. Solo se leen `done`, `denied` y `error`.
  const { done, denied, error } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fdevice");
  const t = await getT();

  if (done) {
    return (
      <Shell title={t.device.doneTitle} cmd="concat login --device">
        <Done title={t.device.doneTitle} hint={t.device.doneBody} />
      </Shell>
    );
  }
  if (denied) {
    return (
      <Shell title={t.device.deniedTitle} cmd="concat login --device">
        <Notice tone="ok" title={t.device.deniedTitle}>
          {t.device.deniedBody}
        </Notice>
      </Shell>
    );
  }

  const token = (await cookies()).get(deviceConfirmCookieName())?.value;
  const userCode = token ? await verifyDeviceConfirm(token, user.id) : null;
  const device = userCode ? await oauthServer().lookupDevice(userCode) : null;

  if (!device) {
    return (
      <Shell title={t.device.title} cmd="concat login --device">
        {error ? <Notice tone="error">{t.device.codeError}</Notice> : null}
        <Identity email={user.email} label={t.dashboard.signedInAs} />
        <CodeForm error={Boolean(error)} t={t} />
        <SwitchAccount email={user.email} next="/device" />
      </Shell>
    );
  }

  let clientName = device.clientId;
  try {
    clientName = (await resolveClient(device.clientId)).name;
  } catch {
    /* se muestra el client_id tal cual */
  }
  const where = [device.initCountry, device.initIp].filter(Boolean).join(" / ") || t.device.unknown;

  return (
    <Shell title={t.device.approveTitle} cmd="concat login --device">
      <p className="lede">
        <strong>{clientName}</strong> {t.device.wants}:
      </p>
      <Identity email={user.email} label={t.dashboard.signedInAs} />
      <dl className="facts">
        <dt>{t.device.client}</dt>
        <dd>
          <code>{device.clientId}</code>
        </dd>
        <dt>{t.device.code}</dt>
        <dd>
          <code className="code-big">{device.userCode}</code>
        </dd>
        <dt>{t.device.started}</dt>
        <dd>
          <time dateTime={device.createdAt.toISOString()}>{device.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC</time>
        </dd>
        <dt>{t.device.from}</dt>
        <dd>{where}</dd>
        <dt>{t.device.scope}</dt>
        <dd>{t.scope(device.scope)}</dd>
      </dl>
      <Notice tone="warn">{t.device.warning}</Notice>
      <div className="actions">
        <form action={approve}>
          <SubmitButton className={button} pending={t.device.approving}>
            {t.device.approve}
          </SubmitButton>
        </form>
        <form action={cancel}>
          <SubmitButton className="btn" pending={t.device.denying}>
            {t.device.deny}
          </SubmitButton>
        </form>
      </div>
      <SwitchAccount email={user.email} next="/device" />
    </Shell>
  );
}
