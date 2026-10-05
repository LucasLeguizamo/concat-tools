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
import { button, describeScope, Identity, Notice, Shell, SwitchAccount } from "../../lib/auth/ui";
import { t } from "../../lib/copy";
import { rateLimiter } from "../../lib/rate-limit";

export const dynamic = "force-dynamic";
export const metadata = { title: t.device.title };

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

async function cancel() {
  "use server";
  (await cookies()).set(deviceConfirmCookieName(), "", cookieOptions(0));
  redirect("/device");
}

function CodeForm({ error }: { error: boolean }) {
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

export default async function DevicePage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  // `?code=` se ignora a proposito. Solo se leen `done` y `error`.
  const { done, error } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fdevice");

  if (done) {
    return (
      <Shell title={t.device.doneTitle} cmd="concat login --device">
        <Notice tone="ok">{t.device.doneBody}</Notice>
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
        <CodeForm error={Boolean(error)} />
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
        <dd>{describeScope(device.scope)}</dd>
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
