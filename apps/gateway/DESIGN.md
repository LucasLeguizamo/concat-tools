---
name: CONCAT Google Gateway
description: Pages between a developer's terminal and Google, styled in terminal and pixel art, read-only, honest about status.
colors:
  phosphor-black: "#0a0c09"
  crt-panel: "#10150e"
  grid-line-faint: "#1c2619"
  grid-line: "#33452d"
  control-edge: "#56704d"
  phosphor-paper: "#d9e4d2"
  hot-white: "#ffffff"
  moss-dim: "#93a38b"
  moss-faint: "#7d8c75"
  terminal-green: "#7ee26b"
  terminal-green-deep: "#2f6b27"
  terminal-ink: "#07120a"
  signal-amber: "#f0b340"
  signal-amber-deep: "#5c4416"
  fault-coral: "#f07a6a"
  fault-coral-deep: "#5e2a22"
typography:
  display:
    fontFamily: "Silkscreen, 'Courier New', monospace"
    fontSize: "clamp(1.4rem, 4vw, 1.9rem)"
    fontWeight: 700
    lineHeight: 1.15
  title:
    fontFamily: "Silkscreen, 'Courier New', monospace"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.3
  label:
    fontFamily: "Silkscreen, 'Courier New', monospace"
    fontSize: "0.9rem"
    fontWeight: 700
    letterSpacing: "0.06em"
  body:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  small:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "0.78rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  none: "0px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.terminal-green}"
    textColor: "{colors.terminal-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.55rem 1.1rem"
    height: "42px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.phosphor-paper}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.55rem 1.1rem"
    height: "42px"
  button-attention:
    backgroundColor: "transparent"
    textColor: "{colors.signal-amber}"
    rounded: "{rounded.none}"
    padding: "0.3rem 0.8rem"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.fault-coral}"
    textColor: "{colors.terminal-ink}"
    rounded: "{rounded.none}"
    padding: "0.3rem 0.8rem"
    height: "36px"
  window:
    backgroundColor: "{colors.crt-panel}"
    textColor: "{colors.phosphor-paper}"
    rounded: "{rounded.none}"
    padding: "clamp(1.1rem, 4vw, 1.75rem)"
  module-card:
    backgroundColor: "{colors.phosphor-black}"
    textColor: "{colors.phosphor-paper}"
    rounded: "{rounded.none}"
    padding: "1rem"
  input-code:
    backgroundColor: "{colors.phosphor-black}"
    textColor: "#ffffff"
    rounded: "{rounded.none}"
    padding: "0.5rem 0.75rem"
    height: "42px"
---

# Design System: CONCAT Google Gateway

## Overview

**Creative North Star: "The Trusted Terminal"**

Every page reads as the output of the developer's own terminal. The user arrives from `concat login` or `concat connect`, and the window bar repeats that command (`$ concat connect gsc`). Titles start with a `>` prompt. Notices are log lines (`[ok]`, `[error]`, `[!]`). The page shows the CLI equivalent of each action next to its button. The terminal metaphor is not a costume: each element either reports true state, names the account being authorized, or gives the next command.

The density is calm and dark, built for a short stop. The user should leave within seconds. A dark phosphor field with a faint 22px dot grid holds a single framed window. Inside it, trust information comes first (which account, which client, read-only), then one primary action. Character comes from pixel display type, hard square shadows, and buttons that step down when pressed. There are no gradients, glows, or rounded corners. Color is reserved for meaning.

**Key Characteristics:**
- One framed "window" per page with a CLI title bar; the dashboard window is wider.
- Pixel display type (Silkscreen) for titles, labels and buttons; JetBrains Mono for everything you read.
- Square corners everywhere; depth comes from hard offset shadows only.
- Green means done or primary, amber means act now, coral means failed or destructive. Everything else is moss grey.
- The active Google account is always visible before any approval.
- Content in ES and EN from one dictionary (`lib/copy.ts`).

## Colors

A phosphor-on-black palette with exactly three signal colors, each owning one meaning.

### Primary
- **Terminal Green** (#7ee26b): primary actions (Approve, Connect with Google), the `>` prompt, links, `[ok]` tags, the "Connected" status pixel and the "done" block. It also sets the text selection background.
- **Terminal Green Deep** (#2f6b27): hard shadow under green buttons and the "done" block; border of connected cards.
- **Terminal Ink** (#07120a): text on green, amber or coral fills.

### Secondary
- **Signal Amber** (#f0b340): "requires action", meaning lost or expired permissions, no resources, verifying, `[!]` notices, Reconnect and Check again buttons, and the focus ring (3px).
- **Signal Amber Deep** (#5c4416): borders and shadows of attention cards and notices.

### Tertiary
- **Fault Coral** (#f07a6a): errors and the destructive confirm ("Yes, disconnect"); `[error]` tags.
- **Fault Coral Deep** (#5e2a22): border of error notices and the disconnect panel.

### Neutral
- **Phosphor Black** (#0a0c09): page field, cards, inputs, notices.
- **CRT Panel** (#10150e): the window surface.
- **Grid Line Faint** (#1c2619): background dot grid.
- **Grid Line** (#33452d): window and card borders, default hard shadow, row dividers.
- **Control Edge** (#56704d): borders of inputs and neutral tags (at least 3:1 against both surfaces).
- **Phosphor Paper** (#d9e4d2): body text (14.9:1).
- **Hot White** (#ffffff): emphasis only, such as titles, module names, the account email and the device code.
- **Moss Dim** (#93a38b): secondary text, hints, footer links (7.3:1).
- **Moss Faint** (#7d8c75): the smallest metadata, such as ids, probe times and window bar text (5.5:1 on black, 5.2:1 on the panel; never darker).

### Named Rules
**The Three Signals Rule.** Green, amber and coral each mean one thing: done or primary, act now, failed or destructive. Decorative uses are forbidden. A beta tag is neutral (moss on a control edge), never amber.

**The No Grey On Small Text Rule.** No text uses a color below #7d8c75. Every text pairing passes WCAG AA (4.5:1).

## Typography

**Display Font:** Silkscreen (with 'Courier New', monospace)
**Body Font:** JetBrains Mono (with ui-monospace, SF Mono, Menlo)

**Character:** Chunky 8-bit capitals mark structure (titles, section labels, buttons). The monospace body carries every sentence and command, so commands and prose share one voice.

### Hierarchy
- **Display** (700, clamp(1.4rem, 4vw, 1.9rem), 1.15): page title, always prefixed by a green `> `; balanced wrapping.
- **Title** (700, 1rem): module names on cards and in rows.
- **Label** (700, 0.8–0.9rem, uppercase, 0.06em tracking): section headings and button text. Never below 0.75rem.
- **Body** (400, 15px, 1.6): sentences, facts and notices. Line length is capped at 72ch.
- **Small** (400, 0.85rem): hints, section notes, secondary lines and fact labels.
- **Meta** (400, 0.78rem): resource counts, probe times (always with "UTC") and ids.

### Named Rules
**The Mono Means Something Rule.** Monospace is the body voice because the content is commands, ids, scopes and timestamps, not because it looks "technical". Commands always appear in the `$ command | Copy` block.

## Layout

There is one centered column with a 16px side gutter. Auth pages use a narrow window (max 38rem); the dashboard uses a wide one (max 76rem). Pages have generous top padding (clamp(1.5rem, 6vw, 4rem)) because they are interstitial. Inside the window, the trust facts come first, as a two-column `dl` (label / value) that collapses to one column under 40rem.

The dashboard shows modules that have a state (connected or needing action) as cards in an auto-fill grid (min 16rem, aligned to the top). Modules that are not connected collapse into compact rows (name · command · Connect) below the cards, so they never compete with modules that need action. Each section is ordered by urgency: lost permission, then expired, no resources, verifying, connected, not connected.

Spacing steps are 0.25 / 0.5 / 1 / 1.5 / 2rem. Groups sit tight (0.5rem) and sections sit far apart (2rem above section labels).

## Elevation & Depth

Depth is structural and flat-shaded: hard offset shadows with no blur. Nothing floats softly. Surfaces are either on the field (black) or inside the window (panel).

### Shadow Vocabulary
- **Window** (`box-shadow: 8px 8px 0 #33452d`): the single main frame of each page.
- **Button rest** (`box-shadow: 4px 4px 0 #33452d`); on green, use `#2f6b27`; on amber, `#5c4416`; on coral, `#5e2a22`.
- **Button hover** (`translate(-2px,-2px)` plus a 6px shadow): the button lifts.
- **Button active** (`translate(3px,3px)` plus a 0 shadow): the button presses flat. Motion is `80ms steps(2)`.
- **Done block**: no shadow (it sits inside the window, and nested frames don't stack depth). Its 2px green border carries the weight.

### Named Rules
**The Hard Shadow Rule.** Every shadow is a solid block offset down and to the right, in the deep tone of its surface's signal color. Blur, glow and colored halos are forbidden.

## Shapes

Corners are square (0px) everywhere: windows, cards, buttons, inputs, tags and notices. Borders are 2px on windows, cards and buttons, and 1px on notices, command blocks, tags and identity boxes. Status is shown by a square 8px pixel before the label (it blinks with `steps(2)` while verifying, and stays still with reduced motion). The window bar has three square 10px "lights".

## Components

### Buttons
Tactile and dry: blocks that step down when pressed.
- **Shape:** square (0px), 2px border, pixel uppercase label.
- **Primary:** Terminal Green fill, Terminal Ink text, green-deep hard shadow. One per screen.
- **Secondary:** transparent with a Phosphor Paper border and text, grid-line shadow.
- **Attention (sm):** amber border and text. Only for actions that fix a state (Reconnect, Check again).
- **Destructive (sm):** coral fill. It only appears inside an opened confirmation, never at rest.
- **Pending:** while a server action runs, disabled at 0.7 opacity with the "…ing" label; this prevents double submits.
- **Focus:** a 3px amber outline with a 2px offset on every interactive element.

### Window
- **Frame:** CRT Panel, 2px Grid Line border, hard 8px shadow.
- **Title bar:** three square lights followed by the CLI command that brought the user here (`$ concat connect gsc`), in Moss Faint.
- **Body:** a `>`-prefixed display title, then content.

### Identity
A boxed line on black with a 1px Grid Line border: an uppercase micro-label ("Google account") followed by the email in white. The email wraps anywhere and never overflows. It appears before every approval and connection, followed by "Not you? Use another account".

### Notice (log line)
A 1px border in the deep tone of its signal, on black. It starts with a bracketed tag (`[ok]`, `[error]`, `[!]`) in the signal color. The body is in Moss Dim, max 72ch. No side stripe. The **done** variant (2px green border, a pixel-type title and a green "close this tab and go back to your terminal" line) is used only for task completion (connect, device). When a notice is shown, any other pending work becomes one quiet dim line below it; two bordered notices never stack.

### Command block
`$ command` in Phosphor Paper on black, with a separate "Copy" cell. If the clipboard is unavailable, it selects the text and says so. It wraps instead of truncating.

### Module card and row
- **Card:** black, 2px border tinted by state (green when connected, amber-deep when action is needed). The header holds a 20px service logo, a pixel name, and the id or a neutral beta tag. Below come the status pixel and label, meta, the localized hint, and exactly one fixing action ("No resources" adds a quiet "use another account or permissions" link, never "Reconnect"). Disconnect sits on its own right-aligned row behind a dashed rule and a two-step `<details>` with Keep or Yes, disconnect.
- **Row:** a single line with the logo, name, command and Connect; it wraps on mobile.

### Inputs
Black field, 2px Control Edge border, white uppercase mono with 0.12em tracking (device codes). Focus shifts the border to green and shows the amber outline. On error, `aria-invalid` turns the border coral. There is always a visible label and a help line linked via `aria-describedby`.

## Do's and Don'ts

### Do:
- **Do** show the active Google account and "read-only" before any Approve or Connect.
- **Do** end every flow with a "go back to your terminal" state.
- **Do** offer the CLI equivalent (`concat connect <id>`) next to the action that it mirrors.
- **Do** give each status exactly one fixing action that actually fixes it. "No resources" leads to Check again, never to Reconnect.
- **Do** keep all copy in `lib/copy.ts` with the same shape in ES and EN.
- **Do** use the service's own logo from `public/icons/<id>.svg` for each module.

### Don't:
- **Don't** use rounded corners, gradients, glass, blur or soft shadows.
- **Don't** use a colored side stripe (`border-left` wider than 1px) on notices or cards.
- **Don't** use amber, green or coral decoratively (for example, on beta tags).
- **Don't** put text below #7d8c75 or smaller than 0.75rem; use the type ramp (0.75 / 0.78 / 0.85rem, 15px, 1rem, display) and nothing in between.
- **Don't** show a destructive button at rest; it lives only inside an opened confirmation.
- **Don't** weaken security affordances for convenience: device codes are typed by hand, approval pages are never framed, and the account is always visible.
