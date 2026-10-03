# CONCAT Tools

Monorepo (pnpm) de las herramientas open source de CONCAT.

- `apps/gateway`: CONCAT Google Gateway (Next.js, MCP + CLI). Spec: `concat-site/docs/specs/concat-google-gateway-spec.md`.

```bash
pnpm install
cp apps/gateway/.env.example apps/gateway/.env.local   # completar
pnpm --filter gateway db:migrate
pnpm build && pnpm test && pnpm typecheck && pnpm lint
```

Licencia MIT.
