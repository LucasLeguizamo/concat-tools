# Módulos y permisos extra

Generado con `pnpm docs:tools` desde el registro del gateway y de lo que dice `explainError` de cada módulo. Un módulo está **conectado** cuando su llamada de lista (probe) devuelve algo, no cuando termina el login. `<tu correo>` marca dónde el gateway pone tu correo de Google. Los mensajes son los literales del gateway.

Fases (spec §11): **A** verificación de marca y scopes sensibles; **B** scopes sensibles con video demo; **C** scopes restringidos (Gmail, Drive, mensajes de Chat) con evaluación de seguridad CASA, renovada cada 12 meses.

## `gsc`

- **Tipo**: nativo (REST directo)
- **Fase de verificación de Google**: A
- **Estado**: disponible
- **Scopes (solo lectura)**:
  - `https://www.googleapis.com/auth/webmasters.readonly`
- **Permiso extra (fuera de OAuth)**: Tu correo debe ser usuario de la propiedad en Search Console. `sc-domain:` y `https://` son propiedades distintas.

**Si el probe viene vacío**

- **Mensaje**: Tu correo <tu correo> no es usuario de ninguna propiedad.
- **Arreglo**: Search Console → Configuración → Usuarios y permisos. Ojo: `sc-domain:dominio` y `https://dominio/` son propiedades distintas.
- `error: no_resources`, `next_action: fix_resource_permission`

**Si Google responde 403 sobre un recurso**

- **Mensaje**: Tu correo <tu correo> no tiene permiso sobre esa propiedad de Search Console.
- **Arreglo**: Search Console → Configuración → Usuarios y permisos. Ojo: `sc-domain:dominio` y `https://dominio/` son propiedades distintas.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `ga4`

- **Tipo**: nativo (REST directo)
- **Fase de verificación de Google**: A
- **Estado**: disponible
- **Scopes (solo lectura)**:
  - `https://www.googleapis.com/auth/analytics.readonly`
- **Permiso extra (fuera de OAuth)**: Tu correo debe tener rol Viewer (o superior) en la propiedad de GA4.

**Si el probe viene vacío**

- **Mensaje**: Falta el rol Viewer.
- **Arreglo**: GA4 → Admin → Gestión de acceso a la propiedad → agrega <tu correo>.
- `error: no_resources`, `next_action: fix_resource_permission`

**Si Google responde 403 sobre un recurso**

- **Mensaje**: Tu correo <tu correo> no tiene rol Viewer en la propiedad.
- **Arreglo**: GA4 → Admin → Gestión de acceso a la propiedad → agrega <tu correo> como Viewer.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `ads`

- **Tipo**: nativo (REST directo)
- **Fase de verificación de Google**: A
- **Estado**: disponible
- **Scopes (solo lectura)**:
  - `https://www.googleapis.com/auth/adwords`
- **Permiso extra (fuera de OAuth)**: Tu correo debe tener acceso a una cuenta de Google Ads (directo o via MCC; con MCC, indica login_customer_id en ads_search).

**Si el probe viene vacío**

- **Mensaje**: Tu correo <tu correo> no tiene acceso directo a ninguna cuenta de Ads, o falta `login_customer_id` del MCC.
- **Arreglo**: Pide acceso a la cuenta en Google Ads (Administracion > Acceso y seguridad) con <tu correo>. Si entras por un MCC, usa `ads_search` con `login_customer_id` del MCC.
- `error: no_resources`, `next_action: fix_resource_permission`

**Si Google responde 403 sobre un recurso**

- **Mensaje**: <tu correo> no tiene acceso a la cuenta de Ads indicada.
- **Arreglo**: Pide acceso a esa cuenta en Google Ads, o vuelve a llamar con `login_customer_id` = id (10 digitos, sin guiones) de la cuenta administradora (MCC) por la que accedes a esta cuenta. Lo ves en Google Ads, arriba a la derecha.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `people`

- **Tipo**: proxy (servidor MCP de Google Workspace)
- **Fase de verificación de Google**: A
- **Estado**: disponible
- **Scopes (solo lectura)**:
  - `https://www.googleapis.com/auth/contacts.readonly`
  - `https://www.googleapis.com/auth/userinfo.profile`
- **Permiso extra (fuera de OAuth)**: Ninguno adicional: se usa tu propia cuenta de Google.

**Si el probe viene vacío**

- **Mensaje**: <tu correo> no tiene recursos accesibles en people.
- **Arreglo**: Ninguno adicional: se usa tu propia cuenta de Google.
- `error: no_resources`, `next_action: fix_resource_permission`

**Si Google responde 403 sobre un recurso**

- **Mensaje**: <tu correo> no tiene acceso al recurso pedido en people, o el servidor MCP de Google rechazo la solicitud.
- **Arreglo**: Comprueba que <tu correo> puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API people.googleapis.com habilitada.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `calendar`

- **Tipo**: proxy (servidor MCP de Google Workspace)
- **Fase de verificación de Google**: B
- **Estado**: beta cerrada (funciona para la lista de prueba mientras Google no verifique la fase)
- **Scopes (solo lectura)**:
  - `https://www.googleapis.com/auth/calendar.events.readonly`
  - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
- **Permiso extra (fuera de OAuth)**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.

**Si el probe viene vacío**

- **Mensaje**: <tu correo> no tiene recursos accesibles en calendar.
- **Arreglo**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.
- `error: no_resources`, `next_action: fix_resource_permission`

**Si Google responde 403 sobre un recurso**

- **Mensaje**: <tu correo> no tiene acceso al recurso pedido en calendar, o el servidor MCP de Google rechazo la solicitud.
- **Arreglo**: Comprueba que <tu correo> puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API calendarmcp.googleapis.com habilitada.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `docs`

- **Tipo**: proxy (servidor MCP de Google Workspace)
- **Fase de verificación de Google**: B
- **Estado**: beta cerrada (funciona para la lista de prueba mientras Google no verifique la fase)
- **Scopes (solo lectura)**:
  - `https://www.googleapis.com/auth/documents.readonly`
- **Permiso extra (fuera de OAuth)**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.

**Si el probe viene vacío**

- **Mensaje**: <tu correo> no tiene recursos accesibles en docs.
- **Arreglo**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.
- `error: no_resources`, `next_action: fix_resource_permission`

**Si Google responde 403 sobre un recurso**

- **Mensaje**: <tu correo> no tiene acceso al recurso pedido en docs, o el servidor MCP de Google rechazo la solicitud.
- **Arreglo**: Comprueba que <tu correo> puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API docsmcp.googleapis.com habilitada.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `sheets`

- **Tipo**: proxy (servidor MCP de Google Workspace)
- **Fase de verificación de Google**: B
- **Estado**: beta cerrada (funciona para la lista de prueba mientras Google no verifique la fase)
- **Scopes (solo lectura)**:
  - `https://www.googleapis.com/auth/spreadsheets.readonly`
- **Permiso extra (fuera de OAuth)**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.

**Si el probe viene vacío**

- **Mensaje**: <tu correo> no tiene recursos accesibles en sheets.
- **Arreglo**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.
- `error: no_resources`, `next_action: fix_resource_permission`

**Si Google responde 403 sobre un recurso**

- **Mensaje**: <tu correo> no tiene acceso al recurso pedido en sheets, o el servidor MCP de Google rechazo la solicitud.
- **Arreglo**: Comprueba que <tu correo> puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API sheetsmcp.googleapis.com habilitada.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `slides`

- **Tipo**: proxy (servidor MCP de Google Workspace)
- **Fase de verificación de Google**: B
- **Estado**: beta cerrada (funciona para la lista de prueba mientras Google no verifique la fase)
- **Scopes (solo lectura)**:
  - `https://www.googleapis.com/auth/presentations.readonly`
- **Permiso extra (fuera de OAuth)**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.

**Si el probe viene vacío**

- **Mensaje**: <tu correo> no tiene recursos accesibles en slides.
- **Arreglo**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.
- `error: no_resources`, `next_action: fix_resource_permission`

**Si Google responde 403 sobre un recurso**

- **Mensaje**: <tu correo> no tiene acceso al recurso pedido en slides, o el servidor MCP de Google rechazo la solicitud.
- **Arreglo**: Comprueba que <tu correo> puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API slidesmcp.googleapis.com habilitada.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `gmail`

- **Tipo**: proxy (servidor MCP de Google Workspace)
- **Fase de verificación de Google**: C
- **Estado**: beta cerrada (funciona para la lista de prueba mientras Google no verifique la fase)
- **Scopes (solo lectura)**:
  - `https://www.googleapis.com/auth/gmail.readonly` (restringido)
- **Permiso extra (fuera de OAuth)**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada (scope restringido de Gmail).

**Si el probe viene vacío**

- **Mensaje**: <tu correo> no tiene recursos accesibles en gmail.
- **Arreglo**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada (scope restringido de Gmail).
- `error: no_resources`, `next_action: fix_resource_permission`

**Si Google responde 403 sobre un recurso**

- **Mensaje**: <tu correo> no tiene acceso al recurso pedido en gmail, o el servidor MCP de Google rechazo la solicitud.
- **Arreglo**: Comprueba que <tu correo> puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API gmailmcp.googleapis.com habilitada.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `drive`

- **Tipo**: proxy (servidor MCP de Google Workspace)
- **Fase de verificación de Google**: C
- **Estado**: beta cerrada (funciona para la lista de prueba mientras Google no verifique la fase)
- **Scopes (solo lectura)**:
  - `https://www.googleapis.com/auth/drive.readonly` (restringido)
- **Permiso extra (fuera de OAuth)**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada (scope restringido de Drive).

**Si el probe viene vacío**

- **Mensaje**: <tu correo> no tiene recursos accesibles en drive.
- **Arreglo**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada (scope restringido de Drive).
- `error: no_resources`, `next_action: fix_resource_permission`

**Si Google responde 403 sobre un recurso**

- **Mensaje**: <tu correo> no tiene acceso al recurso pedido en drive, o el servidor MCP de Google rechazo la solicitud.
- **Arreglo**: Comprueba que <tu correo> puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API drivemcp.googleapis.com habilitada.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `chat`

- **Tipo**: proxy (servidor MCP de Google Workspace)
- **Fase de verificación de Google**: C
- **Estado**: beta cerrada (funciona para la lista de prueba mientras Google no verifique la fase)
- **Scopes (solo lectura)**:
  - `https://www.googleapis.com/auth/chat.spaces.readonly`
  - `https://www.googleapis.com/auth/chat.memberships.readonly`
  - `https://www.googleapis.com/auth/chat.messages.readonly` (restringido)
- **Permiso extra (fuera de OAuth)**: La Chat app del gateway debe estar disponible para tu dominio de Google Workspace. Modulo en beta cerrada (scope restringido de mensajes de Chat).

**Si el probe viene vacío**

- **Mensaje**: La Chat app no esta disponible para tu dominio (<tu correo>).
- **Arreglo**: Pide al administrador de Google Workspace de tu dominio que permita la Chat app del gateway (Admin console > Apps > Google Workspace Marketplace apps).
- `error: no_resources`, `next_action: fix_resource_permission`

**Si Google responde 403 sobre un recurso**

- **Mensaje**: La Chat app no esta disponible para tu dominio (<tu correo>).
- **Arreglo**: Pide al administrador de Google Workspace de tu dominio que permita la Chat app del gateway (Admin console > Apps > Google Workspace Marketplace apps).
- `error: missing_resource_permission`, `next_action: fix_resource_permission`
