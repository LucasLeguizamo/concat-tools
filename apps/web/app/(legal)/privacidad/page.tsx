import type { Metadata } from "next"
import { LegalPage } from "@/components/legal-page"
import { legal, responsable } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Cómo CONCAT y el CONCAT Google Gateway recogen, usan, protegen y eliminan tus datos, incluidos los datos de usuario de Google. Cumple la Ley 1581 de 2012 y la Google API Services User Data Policy.",
  alternates: { canonical: "https://onconcat.com/privacidad" },
  openGraph: {
    title: "Política de privacidad | CONCAT",
    url: "https://onconcat.com/privacidad",
    type: "article",
  },
}

const scopes = [
  ["openid, email, profile", "Inicio de sesión", "Identificarte y mostrar tu nombre y correo en tu cuenta."],
  ["webmasters.readonly", "Search Console", "Leer tus sitios, el rendimiento de búsqueda (clics, impresiones, CTR, posición) y tus sitemaps."],
  ["analytics.readonly", "Google Analytics 4", "Leer tus cuentas y propiedades y generar reportes de sesiones, usuarios y eventos clave."],
  ["adwords", "Google Ads", "Leer campañas, métricas y estructura de las cuentas a las que tienes acceso. En la versión actual el gateway no crea ni modifica nada."],
  ["gmail.readonly", "Gmail", "Buscar y leer hilos, mensajes y etiquetas cuando tu agente lo pide."],
  ["drive.readonly", "Google Drive", "Buscar archivos, ver sus metadatos y leer su contenido cuando tu agente lo pide."],
  ["documents.readonly, spreadsheets.readonly, presentations.readonly", "Docs, Sheets y Slides", "Leer el contenido de documentos, hojas y presentaciones."],
  ["calendar.events.readonly, calendar.calendarlist.readonly", "Google Calendar", "Listar tus calendarios y leer eventos."],
  ["chat.spaces.readonly, chat.memberships.readonly, chat.messages.readonly", "Google Chat", "Listar espacios y miembros, y buscar y leer mensajes."],
  ["contacts.readonly", "Contactos", "Buscar contactos de tu cuenta."],
]

const sections = [
  {
    id: "responsable",
    title: "Quién es el responsable",
    body: (
      <>
        <p>
          El responsable del tratamiento de tus datos es <strong>{responsable}</strong>, con domicilio en{" "}
          {legal.domicilio}. Para cualquier asunto de privacidad escríbenos a{" "}
          <a href={`mailto:${legal.email}`}>{legal.email}</a>.
        </p>
        <p>Esta política aplica a:</p>
        <ul>
          <li>
            El sitio <a href={legal.sitio}>onconcat.com</a> y sus formularios.
          </li>
          <li>
            El <strong>CONCAT Google Gateway</strong> (<code>gw.onconcat.com</code>), su servidor MCP y la CLI{" "}
            <code>concat</code>, que conectan a tu agente de IA con tus servicios de Google.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "datos-sitio",
    title: "Datos que recogemos en el sitio",
    body: (
      <>
        <ul>
          <li>
            <strong>Formulario de contacto:</strong> nombre, correo, asunto y el mensaje que escribes. Los
            usamos solo para responderte y preparar una propuesta.
          </li>
          <li>
            <strong>Analítica:</strong> usamos Google Analytics y Google Tag Manager para medir visitas de forma
            agregada (páginas vistas, origen del tráfico, dispositivo). Estas herramientas usan cookies. Puedes
            bloquearlas desde tu navegador o con el{" "}
            <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener noreferrer">
              complemento de inhabilitación de Google Analytics
            </a>
            .
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "datos-google",
    title: "Datos de usuario de Google (Gateway)",
    body: (
      <>
        <p>
          El gateway accede a tus datos de Google <strong>solo después de que tú lo autorizas</strong> en la pantalla
          de consentimiento de Google y <strong>solo para el servicio (módulo) que conectas</strong>. Cada módulo pide
          sus permisos por separado y todos son de <strong>solo lectura</strong>.
        </p>
        <h3>Permisos que solicitamos y para qué</h3>
        <div className="legal-scroll">
          <table>
            <thead>
              <tr>
                <th>Permiso (scope)</th>
                <th>Módulo</th>
                <th>Uso</th>
              </tr>
            </thead>
            <tbody>
              {scopes.map(([scope, mod, uso]) => (
                <tr key={scope}>
                  <td>
                    <code>{scope}</code>
                  </td>
                  <td>{mod}</td>
                  <td>{uso}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Algunos módulos pueden no estar disponibles todavía. Nunca pedimos un permiso de un módulo que no hayas
          conectado.
        </p>

        <h3>Qué guardamos</h3>
        <ul>
          <li>Tu identificador de cuenta de Google, correo y nombre, para tu cuenta en CONCAT.</li>
          <li>
            El <strong>token de actualización (refresh token)</strong> que Google nos entrega, cifrado con AES-256-GCM.
            Nunca lo mostramos ni se lo entregamos a tu agente.
          </li>
          <li>Los permisos que efectivamente otorgaste y el estado de conexión de cada módulo.</li>
          <li>
            Un registro de auditoría con la herramienta usada, la fecha y el resultado.{" "}
            <strong>El registro no guarda el contenido de tus datos.</strong>
          </li>
        </ul>

        <h3>Qué no guardamos</h3>
        <p>
          El contenido que leemos de Google (correos, archivos, métricas, eventos, mensajes) se procesa en memoria para
          responder a la solicitud de tu agente y <strong>no se almacena</strong> en nuestras bases de datos.
        </p>

        <h3>A quién llegan tus datos</h3>
        <p>
          Los datos que pide tu agente se entregan <strong>a ti, a través del agente o la herramienta que tú
          conectaste</strong> (por ejemplo Claude, ChatGPT, Cursor o n8n). Ese agente lo eliges y lo controlas tú, y se
          rige por las condiciones de su proveedor. CONCAT no lo controla.
        </p>
      </>
    ),
  },
  {
    id: "uso-limitado",
    title: "Uso limitado de los datos de Google",
    body: (
      <>
        <blockquote>
          El uso que hace CONCAT de la información recibida de las APIs de Google, y su transferencia a cualquier otra
          aplicación, se ajusta a la{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            rel="noopener noreferrer"
          >
            Política de datos de usuario de los servicios de API de Google
          </a>
          , incluidos los requisitos de Uso limitado.
        </blockquote>
        <p lang="en" className="legal-dim">
          CONCAT&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>En concreto:</p>
        <ul>
          <li>
            Usamos los datos de Google <strong>solo para darte las funciones del gateway</strong> que ves y pides.
          </li>
          <li>
            Solo los transferimos a terceros cuando hace falta para darte esas funciones, para cumplir la ley o como
            parte de una fusión o adquisición con tu aviso previo.
          </li>
          <li>
            <strong>No</strong> los usamos para publicidad, ni personalizada ni de retargeting.
          </li>
          <li>
            <strong>No</strong> los vendemos.
          </li>
          <li>
            <strong>No</strong> los usamos para entrenar modelos de inteligencia artificial o aprendizaje automático,
            propios ni de terceros.
          </li>
          <li>
            <strong>Ninguna persona</strong> del equipo lee tus datos, salvo que nos des tu permiso explícito para un
            caso concreto de soporte, por seguridad (por ejemplo, investigar un abuso) o para cumplir la ley.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "seguridad",
    title: "Cómo protegemos los datos",
    body: (
      <ul>
        <li>Cifrado en tránsito con HTTPS/TLS en todas las conexiones.</li>
        <li>Tokens de Google cifrados en reposo con AES-256-GCM y claves con versión para poder rotarlas.</li>
        <li>
          Tu agente recibe un <strong>token propio del gateway</strong>, de corta duración, acotado a los módulos que
          autorizas y revocable en cualquier momento. Nunca recibe tus credenciales de Google.
        </li>
        <li>Mínimo privilegio: solo permisos de lectura. Acceso interno restringido y registrado.</li>
        <li>
          El contenido externo (por ejemplo, el texto de un correo) se trata como dato, nunca como instrucción, para
          reducir el riesgo de inyección de instrucciones.
        </li>
      </ul>
    ),
  },
  {
    id: "conservacion",
    title: "Cuánto tiempo conservamos los datos",
    body: (
      <ul>
        <li>
          <strong>Tokens de Google y estado de módulos:</strong> mientras el módulo esté conectado. Al desconectarlo
          revocamos el token en Google y lo borramos de inmediato.
        </li>
        <li>
          <strong>Registro de auditoría:</strong> 90 días.
        </li>
        <li>
          <strong>Cuenta:</strong> hasta que la elimines. Al eliminarla revocamos todos los tokens y borramos tus datos
          en un máximo de 30 días.
        </li>
        <li>
          <strong>Mensajes de contacto:</strong> mientras dure la relación comercial y hasta 2 años después, salvo que
          pidas que los borremos antes.
        </li>
      </ul>
    ),
  },
  {
    id: "revocar",
    title: "Cómo revocar el acceso y borrar tus datos",
    body: (
      <ol>
        <li>
          Desde tu panel del gateway o con <code>concat disconnect &lt;módulo&gt;</code>: revoca el token y lo borra.
        </li>
        <li>
          Desde tu cuenta de Google, en{" "}
          <a href="https://myaccount.google.com/permissions" rel="noopener noreferrer">
            myaccount.google.com/permissions
          </a>
          , quitando el acceso a CONCAT. El gateway lo detecta en su chequeo diario y borra el token.
        </li>
        <li>
          Escribiendo a <a href={`mailto:${legal.email}`}>{legal.email}</a> para eliminar tu cuenta y todos tus datos.
        </li>
      </ol>
    ),
  },
  {
    id: "encargados",
    title: "Proveedores y transferencias internacionales",
    body: (
      <>
        <p>Para operar usamos proveedores que tratan datos por cuenta nuestra (encargados):</p>
        <ul>
          <li>
            <strong>Vercel Inc.</strong> (Estados Unidos): alojamiento y cómputo.
          </li>
          <li>
            <strong>Proveedor de base de datos Postgres gestionada</strong> (Estados Unidos): almacenamiento cifrado de
            cuentas y tokens.
          </li>
          <li>
            <strong>Google LLC</strong> (Estados Unidos): las APIs a las que conectas y la analítica del sitio.
          </li>
        </ul>
        <p>
          Esto implica una transferencia internacional de datos a Estados Unidos. Al aceptar esta política la
          autorizas, en los términos de la Ley 1581 de 2012. Exigimos a estos proveedores medidas de seguridad
          equivalentes a las nuestras.
        </p>
      </>
    ),
  },
  {
    id: "derechos",
    title: "Tus derechos (Habeas Data)",
    body: (
      <>
        <p>
          Según la Ley 1581 de 2012 y el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015), tienes derecho a:
        </p>
        <ul>
          <li>Conocer, actualizar y rectificar tus datos.</li>
          <li>Pedir prueba de la autorización que nos diste.</li>
          <li>Saber cómo hemos usado tus datos.</li>
          <li>Revocar la autorización y pedir que borremos tus datos.</li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).</li>
          <li>Acceder gratis a tus datos.</li>
        </ul>
        <p>
          Escríbenos a <a href={`mailto:${legal.email}`}>{legal.email}</a> con tu nombre, el correo de tu cuenta y tu
          solicitud. Respondemos <strong>consultas en máximo 10 días hábiles</strong> y{" "}
          <strong>reclamos en máximo 15 días hábiles</strong>. Si necesitamos más tiempo te avisaremos antes del
          vencimiento, como permite la ley.
        </p>
      </>
    ),
  },
  {
    id: "menores",
    title: "Menores de edad",
    body: <p>Nuestros servicios están dirigidos a empresas y profesionales. No recogemos a sabiendas datos de menores de 18 años.</p>,
  },
  {
    id: "cambios",
    title: "Cambios a esta política",
    body: (
      <p>
        Si cambiamos esta política publicaremos la nueva versión aquí con su fecha de vigencia. Si el cambio afecta
        cómo usamos los datos de Google, te avisaremos por correo y te pediremos un nuevo consentimiento antes de
        aplicarlo.
      </p>
    ),
  },
]

export default function PrivacidadPage() {
  return (
    <LegalPage
      eyebrow="privacidad.md"
      title="Política de privacidad"
      intro={
        <>
          <p>
            Explicamos qué datos tratamos, para qué, cómo los protegemos y cómo puedes borrarlos. Esto incluye el sitio
            de CONCAT y el CONCAT Google Gateway.
          </p>
          <p>
            <strong>En corto:</strong> el gateway solo lee, solo guarda tu token cifrado (no tus
            datos), no vende nada, no entrena modelos con tus datos y puedes revocar el acceso cuando quieras.
          </p>
        </>
      }
      sections={sections}
    />
  )
}
