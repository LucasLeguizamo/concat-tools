# CONCAT Tools

**ES** · Herramientas open source de CONCAT para agentes. **EN** · CONCAT's open source tools for agents.

## CONCAT Google Gateway

**ES** · Un gateway entre tu agente y Google (Search Console, GA4, Ads, Workspace). Inicias sesión una vez; el agente nunca ve tokens de Google. Solo lectura. Dos puertas al mismo catálogo: **MCP** (`https://gw.onconcat.com/mcp`) y la **CLI** `concat`.

**EN** · A gateway between your agent and Google (Search Console, GA4, Ads, Workspace). You sign in once; the agent never sees Google tokens. Read-only. Two doors to the same catalog: **MCP** (`https://gw.onconcat.com/mcp`) and the `concat` **CLI**.

```bash
claude mcp add --transport http concat https://gw.onconcat.com/mcp
npx -y @concat/cli login && npx -y @concat/cli connect gsc ga4
```

| | Español | English |
| --- | --- | --- |
| Quickstart | [docs/es/quickstart.md](docs/es/quickstart.md) | [docs/en/quickstart.md](docs/en/quickstart.md) |
| Módulos / Modules | [docs/es/modules.md](docs/es/modules.md) | [docs/en/modules.md](docs/en/modules.md) |
| Herramientas / Tools | [docs/es/tools.md](docs/es/tools.md) | [docs/en/tools.md](docs/en/tools.md) |
| Errores / Errors | [docs/es/errors.md](docs/es/errors.md) | [docs/en/errors.md](docs/en/errors.md) |
| Seguridad / Security | [docs/es/security.md](docs/es/security.md) | [docs/en/security.md](docs/en/security.md) |
| Tokens de API / API tokens | [docs/es/api-tokens.md](docs/es/api-tokens.md) | [docs/en/api-tokens.md](docs/en/api-tokens.md) |
| Self-host | [docs/es/self-host.md](docs/es/self-host.md) | [docs/en/self-host.md](docs/en/self-host.md) |

## Monorepo

- `apps/gateway`: el gateway (Next.js, MCP + OAuth) / the gateway. Evals in `apps/gateway/evals`.
- `apps/web`: landing ES/EN (Next.js, SSG, terminal + pixels). `pnpm --filter web dev`; optional env in `apps/web/README.md`.
- `packages/cli`: `@concat/cli`.
- `server.json`: entrada del [MCP Registry](https://github.com/modelcontextprotocol/registry) / MCP Registry entry.

```bash
pnpm install
cp apps/gateway/.env.example apps/gateway/.env.local   # completar / fill in
pnpm --filter gateway db:migrate
pnpm build && pnpm test && pnpm typecheck && pnpm lint
pnpm docs:tools     # regenera docs/*/tools.md y modules.md / regenerates the generated docs
pnpm eval:tasks     # evals de tareas con un modelo (ANTHROPIC_API_KEY) / model task evals
```

Licencia / License: MIT.
