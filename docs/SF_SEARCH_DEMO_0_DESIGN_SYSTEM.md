# sf-search-demo-0 Design System Extraction

This document extracts the practical design system used in:

- `/tmp/sf-search-demo-0/app/globals.css`
- `/tmp/sf-search-demo-0/app/layout.tsx`
- `/tmp/sf-search-demo-0/components/ui/button.tsx`
- `/tmp/sf-search-demo-0/components/ui/icon-button.tsx`
- `/tmp/sf-search-demo-0/app/login/page.tsx`
- `/tmp/sf-search-demo-0/app/workspace/workspace-page-client.tsx`
- `/tmp/sf-search-demo-0/app/components/chat/widget-renderer.tsx`
- `/tmp/sf-search-demo-0/lib/widget-guidelines.ts`
- `/tmp/sf-search-demo-0/lib/bot/artifact-theme.ts`
- `/tmp/sf-search-demo-0/components.json`

It is not a formal token package in the source repo. The design system is implemented as:

1. Custom CSS variables in `app/globals.css`
2. Tailwind/shadcn tokens bridged from those variables
3. A clear typography stack
4. A small set of repeated interaction and surface patterns
5. A separate artifact/widget host theme for generated UI

## 1. Design Philosophy

The product language is:

- Warm, light, editorial SaaS rather than cold enterprise chrome
- Salesforce-adjacent, but not visually dependent on raw Salesforce Lightning UI
- Flat surfaces with restrained shadows
- Soft stone neutrals with blue semantic accents
- High-density workspace layout with gentle rounded corners
- Light mode first, with complete dark-mode token parity

The repo explicitly treats custom `--color-*` tokens as the source of truth, and uses shadcn/Tailwind tokens as a compatibility layer.

## 2. Foundations

### 2.1 Typography

Loaded in `/tmp/sf-search-demo-0/app/layout.tsx`:

- `Geist` as `--font-geist`
- `Inter` as `--font-inter`
- `Instrument Serif` as `--font-instrument-serif`

Actual app shell default in `/tmp/sf-search-demo-0/app/globals.css`:

- Primary sans: `var(--font-geist), -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif`
- Editorial serif utility: `var(--font-instrument-serif), serif`

Usage pattern:

- App shell and chat copy: Geist/system sans
- Editorial display moments: Instrument Serif
- iOS/macOS standalone shells shift toward native Apple system fonts for a more platform-native feel

Typography guidance from `/tmp/sf-search-demo-0/lib/widget-guidelines.ts`:

- Default widget font is effectively an Anthropic-style sans via `--font-sans`
- Serif is reserved for rare editorial emphasis
- Heading weights are restrained
- Body copy is roomy and readable rather than compressed

### 2.2 Color System

The main app tokens live in `/tmp/sf-search-demo-0/app/globals.css`.

#### Light mode core

- Background: `#f5f5f4`
- Surface: `#ffffff`
- Secondary background: `#efefec`
- Hover surface: `#f5f4f1`
- Text primary: `#1c1c1a`
- Text secondary: `#44443e`
- Text muted: `#8a8a82`
- Accent: `rgba(37, 99, 235, 0.9)`
- Accent hover: `#1d4ed8`
- Accent light: `rgba(37, 99, 235, 0.08)`

#### Dark mode core

- Background: `#090b10`
- Surface: `#13161d`
- Secondary background: `#171c25`
- Hover surface: `#1b202a`
- Text primary: `#f4f7ff`
- Text secondary: `#d5dbea`
- Text muted: `#a4adbe`
- Accent: `#3b82f6`
- Accent hover: `#60a5fa`
- Accent light: `rgba(59, 130, 246, 0.12)`

#### Semantic colors

- Success: green
- Warning: amber/orange
- Error: red
- Info: blue

#### Brand colors

- Salesforce brand blue token: `#00A1E0`
- Brand surface panel: `#131620`
- Brand text: white / white at reduced opacity

This brand surface is intentionally always dark, even in light mode.

### 2.3 Shape and elevation

Core values:

- Base radius token: `0.625rem`
- Message radius: `1rem`
- Card radius: `0.9rem`
- Widget/artifact card radius often stretches to `18px` to `24px`

Shadow language:

- Small, soft, low-contrast shadows
- No aggressive glows or heavy enterprise panel effects
- Example artifact shadow: `0 10px 30px rgba(15, 23, 42, 0.04)`

### 2.4 Motion and interaction

The repo is restrained with motion:

- Fast hover transitions
- Slight press-scale feedback on touch
- Smooth background/color transitions across theme changes
- Motion is used for polish, not spectacle

## 3. Token Groups

### 3.1 App tokens

The real system is organized around these custom token groups:

- Background/surface
- Border
- Text
- Accent
- Chat
- Semantic
- Brand surface
- Glass
- Object-type chips
- Diff colors
- Shadows

This is more useful than treating it as a single generic palette because different product areas have their own semantic bands.

### 3.2 Chat-specific tokens

The chat layer has dedicated tokens, not just reused app tokens:

- `--color-user-bubble`
- `--color-user-bubble-text`
- `--color-chat-input-bg`
- `--color-chat-assistant-text`
- `--color-chat-assistant-muted`
- `--color-chat-surface-soft`
- `--chat-radius-message`
- `--chat-radius-card`
- `--chat-shadow-card`

This means chat is treated as a first-class surface system, not a generic content area.

### 3.3 Widget host tokens

The generated widget system in `/tmp/sf-search-demo-0/app/components/chat/widget-renderer.tsx` uses a different but compatible token layer:

- `--color-background-primary`
- `--color-background-secondary`
- `--color-background-tertiary`
- semantic background tokens
- `--color-text-primary`
- `--color-text-secondary`
- `--color-text-tertiary`
- semantic text tokens
- `--color-border-primary`
- `--color-border-secondary`
- `--color-border-tertiary`
- semantic border tokens

Bridged typography/layout vars:

- `--font-sans`
- `--font-serif`
- `--font-mono`
- `--border-radius-md`
- `--border-radius-lg`
- `--border-radius-xl`

This is the design contract for generative UI.

## 4. Tailwind / shadcn Integration

The repo uses:

- Tailwind v4
- shadcn with `style: "new-york"`
- `baseColor: "neutral"`
- CSS variables enabled

The custom system and shadcn are deliberately separated:

- Custom `--color-*` tokens are preferred for hand-authored styling
- Tailwind/shadcn tokens exist mainly so utility classes and shadcn components still work

This is an important architectural principle from the repo:

- design language is custom
- component utility compatibility comes second

## 5. Surface Patterns

### 5.1 App shell

The shell uses:

- Warm neutral page background
- White or near-white content surfaces
- Soft borders with low alpha
- Blue accent for interactive focus and selection

### 5.2 Brand hero panels

Used in login and onboarding:

- Always-dark panel
- White text
- White-muted support text
- Salesforce logo/identity treatment
- Minimal copy
- Large breathing room

This is the clearest branded pattern in the repo.

### 5.3 Sidebar pattern

Observed in `/tmp/sf-search-demo-0/app/components/sidebar.tsx` and workspace code:

- Narrow information-dense rows
- Soft hover state using `--color-surface-hover`
- Active state emphasized with accent border rather than loud fills
- Search/filter controls use neutral surfaces and accent focus

This creates a quiet file/workspace navigator rather than a loud app menu.

### 5.4 Chat surface pattern

Observed in `globals.css`:

- Assistant blocks are soft surfaces
- User bubble is slightly darker/warm in light mode
- Code blocks and reasoning cards use card radius + card shadow
- Chat surfaces feel nested, not heavily separated

## 6. Component Rules

### 6.1 Buttons

From `/tmp/sf-search-demo-0/components/ui/button.tsx`:

- shadcn-style button base
- sizes: `xs`, `sm`, `default`, `lg`, icon variants
- variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`

Practical rules from actual usage:

- Buttons are compact and rounded, usually `rounded-md` or `rounded-xl`
- Focus state uses visible ring/border treatment
- Primary action usually uses the primary token rather than gradient or glossy treatment
- Touch devices get stronger active feedback

### 6.2 Icon button

From `/tmp/sf-search-demo-0/components/ui/icon-button.tsx`:

- Minimal chrome
- Hover fill with `--color-surface-hover`
- Focus outline uses `--color-accent`
- Accessibility is built in through `label`

This suggests the icon action style should stay understated.

### 6.3 Inputs

Common traits:

- Light neutral surface
- Thin border
- Accent focus ring
- Rounded medium corners
- Quiet placeholder text

This matches both the sidebar search input and widget host form styling.

## 7. Layout System

### 7.1 General layout

The workspace layout uses:

- Multi-panel shell
- Resizable sidebar
- Dense information layout
- Soft separation instead of hard gutters

### 7.2 Spacing

The repo does not expose a tokenized spacing scale, but repeated usage suggests:

- outer page padding: generous
- cards/panels: `16px` to `24px`
- control padding: compact
- repeated use of `rounded-lg`, `rounded-xl`, and `24px`-class surfaces

### 7.3 Device adaptations

There is meaningful device-specific tuning:

- iOS standalone uses native Apple font stack
- macOS standalone adds native-feeling chrome/scrolling
- touch targets expand on coarse pointers
- overscroll is carefully controlled

This system is not purely web-first. It is product-shell aware.

## 8. Widget / Artifact Design System

This is one of the most valuable extracted parts.

### 8.1 Artifact theme

From `/tmp/sf-search-demo-0/lib/bot/artifact-theme.ts`:

- background gradient: `#f5f5f4` to `#efefec`
- surface: `#ffffff`
- surfaceSoft: `#f8f8f6`
- border: `rgba(0, 0, 0, 0.08)`
- text: `#1c1c1a`
- accent: `#2563eb`
- Salesforce blue also available
- success green used for opportunity-oriented artifacts
- radiusCard: `24`
- radiusInner: `18`

This is effectively a “report/artifact” theme layered on top of the app shell.

### 8.2 Generated widget rules

From `/tmp/sf-search-demo-0/lib/widget-guidelines.ts` and widget renderer:

- Flat design only
- No gradients/no glow/no blur/no noisy backgrounds for generated widgets
- Transparent outer container
- Fill available width
- Heading sizes and weights are constrained
- Use CSS variables for colors
- Dark mode must work
- Avoid nested scrolling
- Typography defaults to sans, serif only rarely

This means the generative UI system is intentionally stricter than the human-authored app shell.

### 8.3 Widget renderer baseline

The widget renderer normalizes:

- typography
- form controls
- buttons
- SVG text styles
- box/node/arrow primitives
- color ramps

So the real widget design system is:

- host-owned theme tokens
- model-owned layout/content
- renderer-owned normalization rules

## 9. Color Ramps for Generated Diagrams

The widget guidelines define categorical ramps:

- purple
- teal
- coral
- pink
- gray
- blue
- green
- amber
- red

These are primarily for generated diagrams and rich widgets, not necessarily for the app shell itself.

Important rule:

- color encodes meaning or category
- do not rainbow-sequence colors without semantic purpose

## 10. Product-Specific Visual Signatures

These are the distinctive signatures of this design system:

1. Warm stone neutrals instead of cold gray enterprise neutrals
2. Geist as the product voice
3. Instrument Serif as the “editorial intelligence” accent
4. Salesforce blue used sparingly as accent, not as full product chrome
5. Brand surface remains dark even in light mode
6. Soft borders and quiet cards rather than heavy panelization
7. Widgets/artifacts have their own governed theme contract

## 11. Reusable Extraction

If you want to reproduce this design system in another app, the minimum viable extraction is:

### Typography

- Sans: Geist
- Serif accent: Instrument Serif
- Native fallbacks on iOS/macOS shells

### Core light palette

- Background: `#f5f5f4`
- Surface: `#ffffff`
- Secondary surface: `#efefec`
- Hover surface: `#f5f4f1`
- Text: `#1c1c1a`
- Secondary text: `#44443e`
- Muted text: `#8a8a82`
- Accent: `#2563eb`
- Brand blue: `#00A1E0`

### Core dark palette

- Background: `#090b10`
- Surface: `#13161d`
- Secondary surface: `#171c25`
- Hover surface: `#1b202a`
- Text: `#f4f7ff`
- Secondary text: `#d5dbea`
- Muted text: `#a4adbe`
- Accent: `#3b82f6`

### Surfaces

- App shell: warm neutral
- Main cards: white / near-white
- Brand panels: always dark
- Chat surfaces: softer nested layers
- Artifacts: elevated rounded reporting cards

### Corners and shadows

- General radius: `10px`
- Inner card radius: `18px`
- Artifact radius: `24px`
- Card shadow: very soft, low contrast

## 12. Recommendation for Our App

If we want our ChatGPT app to match this repo more closely, we should adopt:

1. `Geist + Instrument Serif` as the default product typography
2. Warm neutral backgrounds instead of plain white
3. Soft Salesforce-blue accenting rather than broad blue surfaces everywhere
4. Distinct widget host tokens, not just app tokens reused blindly
5. Artifact-style rounded inner panels for generated UI
6. Flat generated widgets, even if the app shell itself uses a little more polish

## 13. Short Summary

This design system is best described as:

`Warm editorial enterprise UI with Salesforce context, native-product typography, quiet surfaces, and a stricter flat generative-widget sub-system.`
