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
import { button, describeScope, Shell } from "../../lib/auth/ui";
import { rateLimiter } from "../../lib/rate-limit";

export const dynamic = "force-dynamic";

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

function CodeForm() {
  return (
    <form action={submitCode} style={{ display: "flex", gap: "0.75rem" }}>
      <input
        name="code"
        placeholder="ABCD-EFGH"
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={12}
        required
        style={{ font: "inherit", padding: "0.5rem", textTransform: "uppercase" }}
      />
      <button type="submit" style={button}>Continuar</button>
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
      <Shell title="Dispositivo autorizado">
        <p>Listo. Vuelve a tu terminal: la CLI terminara el inicio de sesion sola.</p>
      </Shell>
    );
  }

  const token = (await cookies()).get(deviceConfirmCookieName())?.value;
  const userCode = token ? await verifyDeviceConfirm(token, user.id) : null;
  const device = userCode ? await oauthServer().lookupDevice(userCode) : null;

  if (!device) {
    return (
      <Shell title="Autorizar un dispositivo">
        {error && <p role="alert">Codigo no valido, expirado o demasiados intentos. Pide uno nuevo en la CLI.</p>}
        <p>Escribe el codigo que muestra la CLI (<code>concat login</code>). No lo pegues desde un enlace que te hayan enviado.</p>
        <CodeForm />
      </Shell>
    );
  }

  let clientName = device.clientId;
  try {
    clientName = (await resolveClient(device.clientId)).name;
  } catch {
    /* se muestra el client_id tal cual */
  }
  const where = [device.initCountry, device.initIp].filter(Boolean).join(" / ") || "desconocido";

  return (
    <Shell title="Autorizar dispositivo">
      <p>
        <strong>{clientName}</strong> pide acceso como <strong>{user.email}</strong>.
      </p>
      <ul>
        <li>Cliente: <code>{device.clientId}</code></li>
        <li>Codigo: <code>{device.userCode}</code></li>
        <li>Iniciado: <time dateTime={device.createdAt.toISOString()}>{device.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC</time></li>
        <li>Desde (aproximado): {where}</li>
        <li>Permisos: {describeScope(device.scope)}</li>
      </ul>
      <p>
        <strong>Aprueba solo si TU iniciaste este login ahora mismo</strong> y la hora y ubicacion te resultan familiares.
        Si alguien te pidio este codigo, es un intento de robo de cuenta: cancela.
      </p>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <form action={approve}>
          <button type="submit" style={button}>Aprobar</button>
        </form>
        <form action={cancel}>
          <button type="submit" style={{ ...button, background: "#fff", color: "#111" }}>Cancelar</button>
        </form>
      </div>
    </Shell>
  );
}
