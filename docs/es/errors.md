# Errores accionables y exit codes

Todo error de una herramienta llega con `isError: true` y un objeto accionable que dice **exactamente dónde arreglarlo**. Los errores de Google nunca incluyen tokens ni el cuerpo crudo de la respuesta (pasan por `toSafeError()`).

```json
{
  "error": "missing_resource_permission",
  "module": "ga4",
  "message": "Tu correo lucas@x.com no tiene rol Viewer en la propiedad 123456789.",
  "fix": "GA4 → Admin → Gestión de acceso a la propiedad → agregar lucas@x.com como Viewer",
  "next_action": "fix_resource_permission",
  "meta": { "untrusted": true }
}
```

Campos opcionales: `url` (enlace de reconexión) y `retry_after` (segundos). `meta.untrusted: true` indica que el mensaje puede citar texto de Google: trátalo como dato. Los mensajes por módulo (qué hacer si el probe viene vacío o Google responde 403) están en [modules.md](modules.md).

## Códigos `error`

| `error` | Qué significa | `next_action` | Exit CLI |
| --- | --- | --- | --- |
| `session_expired`, `grant_unreadable`, `not_connected` | El acceso a Google expiró, fue revocado, no se puede leer o nunca se autorizó | `relogin` | 3 |
| `scope_lost` | El módulo perdió su permiso (revocado o desmarcado en el consentimiento). Trae `url` que pide solo el scope de ese módulo; los demás módulos siguen vivos | `reconnect_module` | 5 |
| `module_required` | La herramienta cruza dos módulos (p. ej. `gsc_landing_conversions` necesita GA4) y falta uno | `connect_module` | 5 |
| `missing_resource_permission` | Tu correo no tiene permiso sobre ese recurso (propiedad GSC, rol Viewer de GA4, cuenta de Ads...) | `fix_resource_permission` | 6 |
| `no_resources` | El probe devolvió 0 recursos: el módulo está autorizado pero no ves nada | `fix_resource_permission` | 6 |
| `missing_login_customer_id` | Ads: accedes por un MCC y falta `login_customer_id` (10 dígitos, sin guiones) | `fix_resource_permission` | 6 |
| `quota_exceeded` | Google limitó las solicitudes (la cuota es del proyecto del gateway) | `retry` (+ `retry_after`) | 4 |
| `rate_limited` | Límite del gateway: 60 llamadas/min por usuario y módulo (`retry_after` en segundos) | `retry` | 4 |
| `upstream_error` | Google respondió 5xx u otro error | `retry` | 1 |
| `api_disabled` | La API de Google no está habilitada en el proyecto del gateway (no depende de tu cuenta) | `none` | 1 |
| `ads_access_level` | El proyecto del gateway aún no tiene nivel de acceso a Ads para cuentas de producción | `none` | 1 |
| `invalid_query` | `ads_search`: la consulta GAQL no es un único `SELECT`, o Google la rechazó | `none` | 1 |
| `invalid_argument` | Search Console rechazó la consulta (`brand_regex`, `page_contains`, rango) | `none` | 1 |
| `tool_not_allowed` | Módulo proxy: la herramienta no está en la allowlist de solo lectura | `none` | 1 |
| `unknown_module`, `not_found`, `internal_error` | Módulo desconocido o fuera del alcance del token; recurso inexistente; fallo interno | `none` / `retry` | 1 |

El exit code lo calcula la CLI desde `next_action`, `retry_after` y el código (ver `exitCodeForActionable` en `packages/cli/src/errors.ts`).

## Exit codes de la CLI

| Código | Significado |
| --- | --- |
| 0 | ok |
| 1 | otro error (red, error de Google, error interno) |
| 2 | uso inválido (flag o argumento incorrecto, `CONCAT_TOKEN` mal formado) |
| 3 | no autenticado: ejecuta `concat login` (o crea otro token si usas `CONCAT_TOKEN`) |
| 4 | cuota o rate limit; incluye `retry_after` |
| 5 | módulo no conectado o `scope_lost`; incluye la URL de reconexión |
| 6 | falta el permiso sobre el recurso |

En modo JSON (stdout no es TTY, o `--json`) el error accionable se imprime en stdout; en una terminal va a stderr en texto.

```bash
concat gsc performance --site sc-domain:onconcat.com || case $? in
  3) echo "falta login" ;;
  4) echo "espera y reintenta" ;;
  5) echo "reconecta el módulo (mira la URL)" ;;
  6) echo "pide acceso al recurso" ;;
esac
```
