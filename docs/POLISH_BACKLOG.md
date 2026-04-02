# Polish Backlog

This backlog captures the remaining product polish work for the ChatGPT-native dynamic UI app.

It is intentionally focused on:

- UX quality
- visual consistency
- generated widget quality
- ChatGPT-native behavior

It does not repeat core platform work that is already complete.

## Priority Bands

- `P0` = should do before broader internal testing
- `P1` = should do before production/demo maturity
- `P2` = nice-to-have follow-up polish

## P0: Finish the User-Facing Experience

### P0.1 Replace debug-shell copy with product copy

Problem:

- Parts of the widget still read like an internal shell or debug tool.

Scope:

- remove or rewrite low-signal internal labels
- replace engineering-oriented status copy with product-facing copy
- keep technical detail available only where it helps the user

Likely files:

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/App.tsx`
- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/server/src/widget/resource.ts`

Acceptance criteria:

- no visible “shell”, “raw event feed”, or debug-first language in the primary UI
- the first impression feels like a product, not a diagnostics surface

### P0.2 Improve auth-required and reconnect UX

Problem:

- The reconnect state works, but it still feels abrupt and operational.

Scope:

- add a cleaner auth-required screen
- use better headline/body/action hierarchy
- show a clear primary CTA for reconnect
- add a success return state after reconnect

Likely files:

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/App.tsx`
- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/styles.css`

Acceptance criteria:

- reconnect CTA is always obvious
- users understand why auth is needed
- post-auth state clearly returns to the live run flow

### P0.3 Improve loading, empty, and error states

Problem:

- Several states are functional but visually sparse or generic.

Scope:

- design proper loading placeholders
- improve “no data yet” states
- improve stream failure and widget failure states
- make errors actionable where possible

Likely files:

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/App.tsx`
- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/styles.css`

Acceptance criteria:

- no blank-feeling cards
- all loading and failure states look intentional
- major failures provide a next step

### P0.4 Tighten preview-to-final widget transition

Problem:

- The handoff from preview widget to final widget can feel abrupt.

Scope:

- add a clearer progression between:
  - run starting
  - preview widget
  - final widget
- preserve continuity in layout and spacing
- avoid large visual jumps where possible

Likely files:

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/App.tsx`

Acceptance criteria:

- the final widget feels like a refinement of the preview, not a replacement shock
- transitions read as progressive generation

### P0.5 Make reasoning stream easier to scan

Problem:

- The reasoning stream is useful but still visually raw.

Scope:

- improve hierarchy and spacing for reasoning entries
- de-emphasize noisy lines
- highlight the most meaningful milestones

Likely files:

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/App.tsx`
- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/styles.css`

Acceptance criteria:

- reasoning remains useful without dominating the screen
- users can quickly tell what step the run is in

## P1: Align the Product to the Design System

### P1.1 Apply the extracted sf-search-demo-0 typography system everywhere

Problem:

- Typography is closer now, but not fully unified across shell, widget host, and generated surfaces.

Scope:

- standardize on:
  - Geist for app shell and product UI
  - Instrument Serif for editorial emphasis only
  - consistent mono stack for technical content
- remove inconsistent font usage

Reference:

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/docs/SF_SEARCH_DEMO_0_DESIGN_SYSTEM.md`

Acceptance criteria:

- shell, panels, and widget host share the same typography voice
- serif appears only in intentional display moments

### P1.2 Apply shared color and surface tokens to the app shell

Problem:

- Some screens still mix old styling with the newer design direction.

Scope:

- port the warm neutral app shell palette
- unify borders, surfaces, hover states, and shadows
- reduce one-off colors

Likely files:

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/styles.css`
- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/server/src/widget/resource.ts`

Acceptance criteria:

- app shell reads as one cohesive system
- warm-neutral surfaces and accent usage are consistent

### P1.3 Unify shell UI and generated widget host theme

Problem:

- The outer shell and inner widget host are compatible, but not fully visually unified.

Scope:

- align radii, spacing, and theme tokens
- tighten host frame styling around generated widgets
- make embedded artifacts feel native to the app shell

Likely files:

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/App.tsx`
- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/styles.css`

Acceptance criteria:

- generated widgets feel embedded, not dropped in
- host chrome does not visually fight the artifact

### P1.4 Add a small reusable design-token layer in this repo

Problem:

- Styling decisions are still spread across multiple files.

Scope:

- define a small token source for:
  - typography
  - colors
  - radii
  - spacing
  - shadows
- use it across widget shell and generated host

Acceptance criteria:

- common design values live in one clear place
- future styling changes require fewer file edits

## P1: Improve Model-Generated Widget Quality

### P1.5 Improve visualize_read_me prompt quality

Problem:

- Module selection works, but we can make it more reliable and better aligned to the intended visual system.

Scope:

- refine the planning prompt
- give clearer rules for when to choose:
  - interactive
  - chart
  - mockup
  - diagram
  - slds2

Likely files:

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/server/src/services/widget-engine.ts`

Acceptance criteria:

- module choices are more predictable
- widget style better matches the query type

### P1.6 Improve show_widget prompt quality

Problem:

- Generated widgets can still be too generic, too sparse, or too placeholder-like.

Scope:

- improve prompt instructions for:
  - stronger information hierarchy
  - better use of space
  - better Salesforce-oriented visual language
  - cleaner CTAs
  - fewer generic dashboard tropes

Likely files:

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/server/src/services/widget-engine.ts`

Acceptance criteria:

- widgets feel more intentional
- fewer low-quality or generic outputs

### P1.7 Improve repair prompt and validation feedback

Problem:

- Repair works, but the feedback loop can be made more specific and more successful.

Scope:

- improve validation messages
- strengthen repair instructions
- add more targeted checks for common widget failures

Likely files:

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/server/src/services/widget-engine.ts`

Acceptance criteria:

- higher successful repair rate
- fewer silent fallback-to-demo cases

### P1.8 Improve fallback behavior when model generation fails

Problem:

- The current demo fallback is useful, but it can feel too obviously fallback-like.

Scope:

- make fallback widget quality higher
- avoid visibly “demo” reasoning copy in user-facing output
- keep fallback useful without feeling broken

Likely files:

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/server/src/services/widget-engine.ts`
- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/server/src/services/run-orchestrator.ts`

Acceptance criteria:

- fallback still feels intentional
- users are not exposed to unnecessary internal wording

## P1: Improve ChatGPT-Native Feel

### P1.9 Make the app feel less like an embedded dev tool

Problem:

- Some layout and copy still feel like an engineering artifact inside ChatGPT.

Scope:

- simplify visible chrome
- remove low-value status surfaces from the default view
- preserve power details behind disclosure, not at first glance

Acceptance criteria:

- the app reads like a native ChatGPT app surface
- primary content is always the focus

### P1.10 Improve iframe resizing and viewport behavior

Problem:

- We fixed major scroll issues, but the sizing experience can still be smoother across different run states and ChatGPT layouts.

Scope:

- audit resize behavior across:
  - loading
  - preview
  - final widget
  - auth-required
  - error state
- reduce clipping and whitespace jumps

Acceptance criteria:

- no awkward internal scrolling
- height changes feel stable

## P2: Nice-to-Have Polish

### P2.1 Add richer action affordances inside generated widgets

Scope:

- improve action buttons and follow-up prompts
- support cleaner in-widget CTA patterns

### P2.2 Add richer skeleton and staged loading visuals

Scope:

- introduce more expressive loading states before final widget render

### P2.3 Add stronger citation presentation

Scope:

- improve reference styling
- make citations feel more integrated into artifact UI

### P2.4 Create a polished artifact frame component

Scope:

- standard host frame for all generated widgets
- consistent title, status chip, and action rail treatment

## Suggested Execution Order

Recommended implementation order:

1. `P0.1` Replace debug-shell copy
2. `P0.2` Improve auth/reconnect UX
3. `P0.3` Improve loading/empty/error states
4. `P0.4` Tighten preview-to-final transition
5. `P0.5` Improve reasoning scanability
6. `P1.1` Typography alignment
7. `P1.2` Shared color/surface tokens
8. `P1.3` Unify shell and widget host
9. `P1.5` Improve visualize_read_me prompt
10. `P1.6` Improve show_widget prompt
11. `P1.7` Improve repair loop
12. `P1.8` Improve fallback quality
13. `P1.9` ChatGPT-native feel cleanup
14. `P1.10` Resize and viewport polish

## Definition of Polish Completion

This polish backlog is considered complete when:

- the app no longer reads like a debug shell
- auth/reconnect flows feel intentional and clear
- preview/final widget transitions feel smooth
- the shell and generated widget host share one visual language
- model-generated widgets are consistently higher quality
- the app feels natural inside ChatGPT
