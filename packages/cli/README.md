# CONCAT CLI

Cliente de línea de comandos para [CONCAT Google Gateway](https://onconcat.com). Conecta Search Console, Google Analytics 4, Google Ads y contactos con tu agente mediante un gateway que guarda los tokens de Google fuera del agente.

## Inicio rápido

Requiere Node.js 22 o superior.

```bash
npx -y @lucasleguizamo/concat login
npx -y @lucasleguizamo/concat connect gsc ga4
npx -y @lucasleguizamo/concat status
```

También puedes instalar el comando globalmente:

```bash
npm install -g @lucasleguizamo/concat
concat tools
concat gsc performance --site sc-domain:example.com --by query --limit 20
```

El gateway alojado está en `https://gw.onconcat.com`. Usa `CONCAT_GATEWAY_URL` o `--gateway` para apuntar a tu propia instancia. Para CI o n8n, crea un token con `concat tokens create` y pásalo en `CONCAT_TOKEN`.

**Varias cuentas (una por proyecto):** cada perfil es una sesión independiente. `concat login --profile cliente-x` inicia sesión con otra cuenta de Google; en la raíz del proyecto, `echo cliente-x > .concat-profile` hace que todos los comandos dentro de esa carpeta usen ese perfil (también `CONCAT_PROFILE`). Si tu navegador ya tiene otra cuenta abierta, `concat login --copy` copia el link para pegarlo en otro navegador o perfil del navegador (o usa "Usar otra cuenta" en la pantalla de autorización). `connect --copy` hace lo mismo al conectar módulos.

Consulta la [guía en español](https://github.com/LucasLeguizamo/concat-tools/blob/main/docs/es/quickstart.md), la [English quickstart](https://github.com/LucasLeguizamo/concat-tools/blob/main/docs/en/quickstart.md) y el [código fuente](https://github.com/LucasLeguizamo/concat-tools).

## English

Node.js 22+ is required. Run `npx -y @lucasleguizamo/concat login`, connect the modules you need with `connect gsc ga4`, then inspect available commands with `tools`. Google tokens stay in the gateway, outside your agent. Multiple accounts: `--profile <name>` (or a `.concat-profile` file per project, or `CONCAT_PROFILE`) keeps separate sessions; `login --copy` / `connect --copy` copy the link so you can open it in another browser or browser profile. See the [full English quickstart](https://github.com/LucasLeguizamo/concat-tools/blob/main/docs/en/quickstart.md).

MIT License. Copyright © 2026 Lucas Leguizamo.
