# Modules and extra permissions

Generated with `pnpm docs:tools` from the gateway registry and what each module's `explainError` says. A module is **connected** when its list call (probe) returns something, not when login finishes. `<your email>` marks where the gateway inserts your Google email. Gateway messages are in Spanish and quoted verbatim.

Phases (spec §11): **A** brand and sensitive-scope verification; **B** sensitive scopes with a demo video; **C** restricted scopes (Gmail, Drive, Chat messages) with a CASA security assessment, renewed every 12 months.

## `gsc`

- **Type**: native (direct REST)
- **Google verification phase**: A
- **Status**: available
- **Scopes (read-only)**:
  - `https://www.googleapis.com/auth/webmasters.readonly`
- **Extra permission (outside OAuth)**: Tu correo debe ser usuario de la propiedad en Search Console. `sc-domain:` y `https://` son propiedades distintas.

**If the probe comes back empty**

- **Message**: Tu correo <your email> no es usuario de ninguna propiedad.
- **Fix**: Search Console → Configuración → Usuarios y permisos. Ojo: `sc-domain:dominio` y `https://dominio/` son propiedades distintas.
- `error: no_resources`, `next_action: fix_resource_permission`

**If Google answers 403 on a resource**

- **Message**: Tu correo <your email> no tiene permiso sobre esa propiedad de Search Console.
- **Fix**: Search Console → Configuración → Usuarios y permisos. Ojo: `sc-domain:dominio` y `https://dominio/` son propiedades distintas.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `ga4`

- **Type**: native (direct REST)
- **Google verification phase**: A
- **Status**: available
- **Scopes (read-only)**:
  - `https://www.googleapis.com/auth/analytics.readonly`
- **Extra permission (outside OAuth)**: Tu correo debe tener rol Viewer (o superior) en la propiedad de GA4.

**If the probe comes back empty**

- **Message**: Falta el rol Viewer.
- **Fix**: GA4 → Admin → Gestión de acceso a la propiedad → agrega <your email>.
- `error: no_resources`, `next_action: fix_resource_permission`

**If Google answers 403 on a resource**

- **Message**: Tu correo <your email> no tiene rol Viewer en la propiedad.
- **Fix**: GA4 → Admin → Gestión de acceso a la propiedad → agrega <your email> como Viewer.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `ads`

- **Type**: native (direct REST)
- **Google verification phase**: A
- **Status**: available
- **Scopes (read-only)**:
  - `https://www.googleapis.com/auth/adwords`
- **Extra permission (outside OAuth)**: Tu correo debe tener acceso a una cuenta de Google Ads (directo o via MCC; con MCC, indica login_customer_id en ads_search).

**If the probe comes back empty**

- **Message**: Tu correo <your email> no tiene acceso directo a ninguna cuenta de Ads, o falta `login_customer_id` del MCC.
- **Fix**: Pide acceso a la cuenta en Google Ads (Administracion > Acceso y seguridad) con <your email>. Si entras por un MCC, usa `ads_search` con `login_customer_id` del MCC.
- `error: no_resources`, `next_action: fix_resource_permission`

**If Google answers 403 on a resource**

- **Message**: <your email> no tiene acceso a la cuenta de Ads indicada.
- **Fix**: Pide acceso a esa cuenta en Google Ads, o vuelve a llamar con `login_customer_id` = id (10 digitos, sin guiones) de la cuenta administradora (MCC) por la que accedes a esta cuenta. Lo ves en Google Ads, arriba a la derecha.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `people`

- **Type**: proxy (Google Workspace MCP server)
- **Google verification phase**: A
- **Status**: available
- **Scopes (read-only)**:
  - `https://www.googleapis.com/auth/contacts.readonly`
  - `https://www.googleapis.com/auth/userinfo.profile`
- **Extra permission (outside OAuth)**: Ninguno adicional: se usa tu propia cuenta de Google.

**If the probe comes back empty**

- **Message**: <your email> no tiene recursos accesibles en people.
- **Fix**: Ninguno adicional: se usa tu propia cuenta de Google.
- `error: no_resources`, `next_action: fix_resource_permission`

**If Google answers 403 on a resource**

- **Message**: <your email> no tiene acceso al recurso pedido en people, o el servidor MCP de Google rechazo la solicitud.
- **Fix**: Comprueba que <your email> puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API people.googleapis.com habilitada.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `calendar`

- **Type**: proxy (Google Workspace MCP server)
- **Google verification phase**: B
- **Status**: closed beta (works for the test-user list until Google verifies the phase)
- **Scopes (read-only)**:
  - `https://www.googleapis.com/auth/calendar.events.readonly`
  - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
- **Extra permission (outside OAuth)**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.

**If the probe comes back empty**

- **Message**: <your email> no tiene recursos accesibles en calendar.
- **Fix**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.
- `error: no_resources`, `next_action: fix_resource_permission`

**If Google answers 403 on a resource**

- **Message**: <your email> no tiene acceso al recurso pedido en calendar, o el servidor MCP de Google rechazo la solicitud.
- **Fix**: Comprueba que <your email> puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API calendarmcp.googleapis.com habilitada.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `docs`

- **Type**: proxy (Google Workspace MCP server)
- **Google verification phase**: B
- **Status**: closed beta (works for the test-user list until Google verifies the phase)
- **Scopes (read-only)**:
  - `https://www.googleapis.com/auth/documents.readonly`
- **Extra permission (outside OAuth)**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.

**If the probe comes back empty**

- **Message**: <your email> no tiene recursos accesibles en docs.
- **Fix**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.
- `error: no_resources`, `next_action: fix_resource_permission`

**If Google answers 403 on a resource**

- **Message**: <your email> no tiene acceso al recurso pedido en docs, o el servidor MCP de Google rechazo la solicitud.
- **Fix**: Comprueba que <your email> puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API docsmcp.googleapis.com habilitada.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `sheets`

- **Type**: proxy (Google Workspace MCP server)
- **Google verification phase**: B
- **Status**: closed beta (works for the test-user list until Google verifies the phase)
- **Scopes (read-only)**:
  - `https://www.googleapis.com/auth/spreadsheets.readonly`
- **Extra permission (outside OAuth)**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.

**If the probe comes back empty**

- **Message**: <your email> no tiene recursos accesibles en sheets.
- **Fix**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.
- `error: no_resources`, `next_action: fix_resource_permission`

**If Google answers 403 on a resource**

- **Message**: <your email> no tiene acceso al recurso pedido en sheets, o el servidor MCP de Google rechazo la solicitud.
- **Fix**: Comprueba que <your email> puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API sheetsmcp.googleapis.com habilitada.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `slides`

- **Type**: proxy (Google Workspace MCP server)
- **Google verification phase**: B
- **Status**: closed beta (works for the test-user list until Google verifies the phase)
- **Scopes (read-only)**:
  - `https://www.googleapis.com/auth/presentations.readonly`
- **Extra permission (outside OAuth)**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.

**If the probe comes back empty**

- **Message**: <your email> no tiene recursos accesibles en slides.
- **Fix**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada.
- `error: no_resources`, `next_action: fix_resource_permission`

**If Google answers 403 on a resource**

- **Message**: <your email> no tiene acceso al recurso pedido en slides, o el servidor MCP de Google rechazo la solicitud.
- **Fix**: Comprueba que <your email> puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API slidesmcp.googleapis.com habilitada.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `gmail`

- **Type**: proxy (Google Workspace MCP server)
- **Google verification phase**: C
- **Status**: closed beta (works for the test-user list until Google verifies the phase)
- **Scopes (read-only)**:
  - `https://www.googleapis.com/auth/gmail.readonly` (restricted)
- **Extra permission (outside OAuth)**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada (scope restringido de Gmail).

**If the probe comes back empty**

- **Message**: <your email> no tiene recursos accesibles en gmail.
- **Fix**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada (scope restringido de Gmail).
- `error: no_resources`, `next_action: fix_resource_permission`

**If Google answers 403 on a resource**

- **Message**: <your email> no tiene acceso al recurso pedido en gmail, o el servidor MCP de Google rechazo la solicitud.
- **Fix**: Comprueba que <your email> puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API gmailmcp.googleapis.com habilitada.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `drive`

- **Type**: proxy (Google Workspace MCP server)
- **Google verification phase**: C
- **Status**: closed beta (works for the test-user list until Google verifies the phase)
- **Scopes (read-only)**:
  - `https://www.googleapis.com/auth/drive.readonly` (restricted)
- **Extra permission (outside OAuth)**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada (scope restringido de Drive).

**If the probe comes back empty**

- **Message**: <your email> no tiene recursos accesibles en drive.
- **Fix**: Ninguno adicional: se usa tu propia cuenta de Google. Modulo en beta cerrada (scope restringido de Drive).
- `error: no_resources`, `next_action: fix_resource_permission`

**If Google answers 403 on a resource**

- **Message**: <your email> no tiene acceso al recurso pedido en drive, o el servidor MCP de Google rechazo la solicitud.
- **Fix**: Comprueba que <your email> puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API drivemcp.googleapis.com habilitada.
- `error: missing_resource_permission`, `next_action: fix_resource_permission`

## `chat`

- **Type**: proxy (Google Workspace MCP server)
- **Google verification phase**: C
- **Status**: closed beta (works for the test-user list until Google verifies the phase)
- **Scopes (read-only)**:
  - `https://www.googleapis.com/auth/chat.spaces.readonly`
  - `https://www.googleapis.com/auth/chat.memberships.readonly`
  - `https://www.googleapis.com/auth/chat.messages.readonly` (restricted)
- **Extra permission (outside OAuth)**: La Chat app del gateway debe estar disponible para tu dominio de Google Workspace. Modulo en beta cerrada (scope restringido de mensajes de Chat).

**If the probe comes back empty**

- **Message**: La Chat app no esta disponible para tu dominio (<your email>).
- **Fix**: Pide al administrador de Google Workspace de tu dominio que permita la Chat app del gateway (Admin console > Apps > Google Workspace Marketplace apps).
- `error: no_resources`, `next_action: fix_resource_permission`

**If Google answers 403 on a resource**

- **Message**: La Chat app no esta disponible para tu dominio (<your email>).
- **Fix**: Pide al administrador de Google Workspace de tu dominio que permita la Chat app del gateway (Admin console > Apps > Google Workspace Marketplace apps).
- `error: missing_resource_permission`, `next_action: fix_resource_permission`
