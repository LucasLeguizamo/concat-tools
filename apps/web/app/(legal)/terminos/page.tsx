import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage } from "@/components/legal-page"
import { legal, responsable } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Términos de servicio",
  description:
    "Condiciones de uso del sitio de CONCAT y del CONCAT Google Gateway: cuentas, uso aceptable, servicios de Google, responsabilidad y ley aplicable.",
  alternates: { canonical: "https://onconcat.com/terminos" },
  openGraph: {
    title: "Términos de servicio | CONCAT",
    url: "https://onconcat.com/terminos",
    type: "article",
  },
}

const sections = [
  {
    id: "aceptacion",
    title: "Aceptación",
    body: (
      <>
        <p>
          Estos términos regulan el uso del sitio <a href={legal.sitio}>onconcat.com</a> y del{" "}
          <strong>CONCAT Google Gateway</strong> (el &quot;Servicio&quot;), que incluye <code>gw.onconcat.com</code>,
          su servidor MCP y la CLI <code>concat</code>. El Servicio lo presta {responsable}.
        </p>
        <p>
          Al crear una cuenta o usar el Servicio aceptas estos términos y la{" "}
          <Link href="/privacidad">Política de privacidad</Link>. Si usas el Servicio en nombre de una empresa, declaras
          que tienes autorización para obligarla.
        </p>
        <p>
          Los proyectos de automatización a medida que contratas con CONCAT se rigen por su propuesta o contrato. Estos
          términos aplican en lo que ese documento no regule.
        </p>
      </>
    ),
  },
  {
    id: "servicio",
    title: "Qué es el Servicio",
    body: (
      <>
        <p>
          El gateway conecta a tu agente de IA (por ejemplo Claude, ChatGPT, Cursor o n8n) con tus servicios de Google,
          como Search Console, Google Analytics, Google Ads y Google Workspace. Inicias sesión una vez, autorizas cada
          servicio por separado y tu agente consulta tus datos con un token propio del gateway, sin ver tus credenciales
          de Google.
        </p>
        <p>
          La versión actual es de <strong>solo lectura</strong>. Si en el futuro se habilitan funciones de escritura,
          serán opcionales, se activarán por servicio y te pediremos un consentimiento nuevo.
        </p>
      </>
    ),
  },
  {
    id: "cuenta",
    title: "Tu cuenta",
    body: (
      <ul>
        <li>Inicias sesión con tu cuenta de Google. Debes tener al menos 18 años.</li>
        <li>
          Eres responsable de los tokens del gateway que crees (por ejemplo, para n8n o CI) y de guardarlos de forma
          segura. Si sospechas que uno se filtró, revócalo de inmediato desde tu panel o con la CLI.
        </li>
        <li>
          Solo puedes conectar cuentas y propiedades de Google a las que tienes acceso legítimo. El Servicio respeta los
          permisos que Google te da: no puede leer nada que tu cuenta no pueda leer.
        </li>
      </ul>
    ),
  },
  {
    id: "uso-aceptable",
    title: "Uso aceptable",
    body: (
      <>
        <p>No puedes usar el Servicio para:</p>
        <ul>
          <li>Acceder a datos de terceros sin su autorización o violar la privacidad de otras personas.</li>
          <li>Infringir la ley, los términos de Google o derechos de terceros.</li>
          <li>Enviar spam, malware o contenido ilegal.</li>
          <li>
            Saturar el Servicio, eludir los límites de uso, hacer ingeniería inversa de la instancia alojada o intentar
            acceder a cuentas ajenas.
          </li>
          <li>Revender el acceso a la instancia alojada sin un acuerdo escrito con CONCAT.</li>
        </ul>
        <p>
          Podemos suspender una cuenta que incumpla estas reglas o que ponga en riesgo el Servicio o a otros usuarios.
          Salvo urgencia, te avisaremos antes.
        </p>
      </>
    ),
  },
  {
    id: "google",
    title: "Servicios de Google",
    body: (
      <>
        <p>
          El Servicio usa APIs de Google. Tu uso de los productos de Google sigue sujeto a los{" "}
          <a href="https://policies.google.com/terms" rel="noopener noreferrer">
            Términos de servicio de Google
          </a>
          . CONCAT no está afiliado a Google ni respaldado por Google.
        </p>
        <p>
          Google puede cambiar, limitar o retirar sus APIs. Si eso pasa, algunas funciones pueden dejar de estar
          disponibles sin que sea responsabilidad de CONCAT.
        </p>
        <p>
          El tratamiento de los datos de usuario de Google se describe en la{" "}
          <Link href="/privacidad#datos-google">Política de privacidad</Link> y cumple los requisitos de Uso limitado de
          la Google API Services User Data Policy.
        </p>
      </>
    ),
  },
  {
    id: "agente",
    title: "Tu agente de IA",
    body: (
      <>
        <p>
          Tú eliges el agente o la herramienta que se conecta al gateway. Los datos que pide se le entregan a ese agente,
          que se rige por las condiciones de su propio proveedor.
        </p>
        <p>
          Las respuestas y conclusiones que genere tu agente con esos datos son responsabilidad de su proveedor y tuya.
          Revísalas antes de tomar decisiones.
        </p>
      </>
    ),
  },
  {
    id: "datos",
    title: "Tus datos",
    body: (
      <p>
        Tus datos son tuyos. No adquirimos ningún derecho sobre ellos, salvo la autorización limitada para tratarlos y
        prestarte el Servicio, como explica la <Link href="/privacidad">Política de privacidad</Link>. Puedes desconectar
        un servicio o eliminar tu cuenta en cualquier momento.
      </p>
    ),
  },
  {
    id: "open-source",
    title: "Código abierto",
    body: (
      <p>
        El código del gateway se publica bajo la licencia MIT, que regula el uso del código. Estos términos regulan solo
        la instancia alojada por CONCAT. Si alojas tu propia instancia, tú eres responsable de operarla y del
        tratamiento de los datos.
      </p>
    ),
  },
  {
    id: "precios",
    title: "Precios",
    body: (
      <p>
        Mientras el Servicio esté en beta su uso puede ser gratuito. Si introducimos planes de pago, publicaremos los
        precios y te avisaremos antes de cobrar cualquier cosa. Nunca te cobraremos sin tu aceptación expresa.
      </p>
    ),
  },
  {
    id: "disponibilidad",
    title: "Disponibilidad y beta",
    body: (
      <p>
        Hacemos lo razonable para mantener el Servicio disponible y seguro, pero se ofrece &quot;tal cual&quot; y
        &quot;según disponibilidad&quot;. Algunas funciones pueden estar marcadas como beta y cambiar o retirarse.
        Podemos interrumpir el Servicio por mantenimiento o por causas que no controlamos.
      </p>
    ),
  },
  {
    id: "responsabilidad",
    title: "Limitación de responsabilidad",
    body: (
      <>
        <p>
          En la medida que permita la ley, CONCAT no responde por daños indirectos, lucro cesante, pérdida de datos o
          de oportunidades derivados del uso o la imposibilidad de usar el Servicio, ni por fallas de Google o de tu
          agente de IA.
        </p>
        <p>
          La responsabilidad total de CONCAT frente a ti se limita a lo que hayas pagado por el Servicio en los 12 meses
          anteriores al hecho que la origine. Nada de esto limita los derechos que te da la ley de protección al
          consumidor (Ley 1480 de 2011) cuando aplique.
        </p>
      </>
    ),
  },
  {
    id: "terminacion",
    title: "Terminación",
    body: (
      <p>
        Puedes dejar de usar el Servicio y eliminar tu cuenta cuando quieras. Al terminar revocamos tus tokens y
        borramos tus datos en los plazos de la <Link href="/privacidad#conservacion">Política de privacidad</Link>.
        Podemos terminar el Servicio con 30 días de aviso, o de inmediato si incumples estos términos de forma grave.
      </p>
    ),
  },
  {
    id: "cambios",
    title: "Cambios",
    body: (
      <p>
        Podemos actualizar estos términos. Publicaremos la nueva versión aquí con su fecha de vigencia y, si el cambio es
        importante, te avisaremos por correo con al menos 15 días de anticipación.
      </p>
    ),
  },
  {
    id: "ley",
    title: "Ley aplicable y contacto",
    body: (
      <p>
        Estos términos se rigen por las leyes de la República de Colombia. Antes de acudir a un juez intentaremos
        resolver cualquier diferencia de forma directa. Escríbenos a{" "}
        <a href={`mailto:${legal.email}`}>{legal.email}</a>.
      </p>
    ),
  },
]

export default function TerminosPage() {
  return (
    <LegalPage
      eyebrow="terminos.md"
      title="Términos de servicio"
      intro={
        <p>
          Las reglas para usar el sitio de CONCAT y el CONCAT Google Gateway, escritas para que se entiendan a la
          primera.
        </p>
      }
      sections={sections}
    />
  )
}
