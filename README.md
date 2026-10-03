# CONCAT Tools

Monorepo (pnpm) de las herramientas open source de CONCAT.

- `apps/gateway`: CONCAT Google Gateway (Next.js, MCP + CLI). Spec: `concat-site/docs/specs/concat-google-gateway-spec.md`.
- `apps/web`: landing pública ES/EN (Next.js, SSG, estilo terminal + píxeles). `pnpm --filter web dev`; env opcionales en `apps/web/README.md`.

```bash
pnpm install
cp apps/gateway/.env.example apps/gateway/.env.local   # completar
pnpm --filter gateway db:migrate
pnpm build && pnpm test && pnpm typecheck && pnpm lint
```

Licencia MIT.
