# apps/web

Landing pública de CONCAT Tools. Next.js App Router, 100% estática (SSG), sin dependencias de UI/animación.

- Rutas: `/es` (por defecto) y `/en` (`app/[lang]`). `/` redirige a `/es` desde `next.config.ts` (sin middleware, sin detección de Accept-Language).
- Textos: `dictionaries/{es,en}.ts`; `en` está tipado con `Dictionary` (derivado de `es`), así que un campo faltante rompe `tsc`.
- Tipografía: JetBrains Mono (texto) y Silkscreen (titulares), ambas vía `next/font/google`.
- Pixel art: mapas de bits 8x8 en `components/pixel-icon.tsx`, renderizados como un `<path>` SVG.

Variables opcionales (hay defaults a confirmar en `lib/site.ts`): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GITHUB_URL`, `NEXT_PUBLIC_WAITLIST_URL`.

```bash
pnpm --filter web dev        # http://localhost:3000 -> /es
pnpm --filter web build && pnpm --filter web lint && pnpm --filter web typecheck
```
