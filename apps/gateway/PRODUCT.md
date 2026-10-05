# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers who run AI agents (Claude Code, Cursor, n8n, CI) and need those agents to read their Google data. They arrive at the gateway's web pages from the terminal, sent there by the `concat` CLI (`login`, `connect`) or by an MCP client's OAuth flow. They authorize, connect Google modules, and go back to the agent. Many work with more than one Google account, one per project or client, through CLI profiles.

## Product Purpose

CONCAT Google Gateway sits between an agent and Google: Search Console, GA4, Ads, and Google Workspace (People, Calendar, Docs, Sheets, Slides, Gmail, Drive, Chat). The user signs in once and the agent never sees Google tokens. Access is read-only. The web pages handle sign-in, consent, device authorization, module connection, and module status.

Success: a user understands what they are granting (which account, which modules, read-only), approves without hesitating, and is back in their terminal within seconds.

## Positioning

One catalog behind two entry points, MCP (`https://gw.onconcat.com/mcp`) and the `concat` CLI, built on a single core. Google refresh tokens stay encrypted in the gateway and never reach the agent. Scopes are per module and read-only. A module counts as "connected" only when a real probe call returns data, not when OAuth completes. The project is open source under the MIT license and can be self-hosted.

## Operating Context

- Entry is almost always a link that the CLI opens or copies (`concat login`, `concat login --copy`, `concat connect <module>`) or an MCP client's OAuth redirect. The web page is a short stop, not a home base.
- Pages: `/login`, `/oauth/consent`, `/device` (user types a code shown in the terminal), `/connect/[module]`, `/dashboard` (module status with connect, reconnect, and disconnect), plus error pages.
- People switch Google accounts between projects. Consent and device pages offer "Usar otra cuenta", and Google login shows the account chooser.
- Workspace modules are a closed beta: only Google test-list accounts can use them until the app is verified.

## Capabilities and Constraints

- Read-only by design. Write access (v2) is opt-in and not built yet.
- Approval pages are anti-clickjacking protected (no framing). The device flow requires the user to type the code by hand (no prefilled links). Both are security rules and must not be weakened for convenience.
- Module statuses: not_connected, authorized, connected, no_resources, scope_lost, expired.
- Language: the gateway pages must support Spanish and English, matching the landing and the docs. Today they are Spanish only; how the language is chosen (URL, Accept-Language, toggle) is undecided.
- Stack: Next.js App Router on Vercel, Postgres (Neon). Its sibling app `apps/web` is the onconcat.com landing.

## Brand Commitments

- Name: CONCAT, CONCAT Google Gateway. Domain `gw.onconcat.com`.
- The CONCAT brand's primary style is terminal and pixel art, shared with `apps/web`. This was the user's explicit direction from 2026-10-03.
- Voice: direct and technical, with no marketing fluff. It states exactly what access is granted.

## Evidence on Hand

- Official service logos in `public/icons/<module>.svg` (svgl.app and Wikimedia Commons).
- No testimonials, customers, usage numbers, or certifications exist. Do not invent them. Google app verification and CASA are still pending.

## Product Principles

1. Trust before speed, then speed. Always show which account, which modules, and that access is read-only before asking for approval.
2. Get the user back to the terminal. Every page should end in a clear "done, go back to your agent" state.
3. Report the true status. Show connected only when it is verified, and give actionable errors that say what to fix.
4. Security affordances are features. Visible account identity, hand-typed device codes, and explicit cancel buttons stay prominent.

## Accessibility & Inclusion

No product-specific requirement established beyond the web baseline (WCAG AA contrast, keyboard operability, visible focus).
