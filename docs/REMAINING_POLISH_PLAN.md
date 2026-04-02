# Remaining Polish Plan

This document captures the remaining polish work after the core app, streaming path, and first UI refinement slices were completed.

The app is already functional and product-shaped. What remains is deeper refinement:

- visual unification
- stronger generated-widget quality
- more natural ChatGPT-native behavior
- tighter evidence/reasoning presentation
- end-to-end polish of edge states

## Goal

Ship a version of the app that:

- feels cohesive rather than layered together
- produces stronger model-generated artifacts more consistently
- behaves naturally inside ChatGPT
- stays polished even in fallback, reconnect, and failure modes

## Phase 1: Visual Unification

### Objective

Make the shell, widget host, and generated artifact feel like one design system.

### Work Items

1. Add a shared design-token layer
   - colors
   - typography
   - radii
   - spacing
   - shadows

2. Refactor the widget shell to use those tokens consistently

3. Refactor the artifact frame and generated widget host to use the same token language

4. Reduce one-off styling differences between:
   - shell cards
   - auth panels
   - loading states
   - widget containers

### Likely Files

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/styles.css`
- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/App.tsx`
- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/server/src/widget/resource.ts`

### Exit Criteria

- one clear token source exists
- shell and generated workspace look intentionally related
- visual values are less duplicated and easier to maintain

## Phase 2: Generated Widget Quality

### Objective

Improve the quality, consistency, and usefulness of model-generated widgets.

### Work Items

1. Improve `visualize_read_me` module-selection quality
   - reduce over-selection
   - improve choice accuracy

2. Improve `show_widget` artifact composition quality
   - stronger hierarchy
   - better primary insight selection
   - less generic dashboard behavior
   - fewer invented metrics

3. Improve validation messaging
   - more specific feedback for broken widget JS
   - better signal for common failure modes

4. Improve repair prompts
   - preserve visual intent better
   - reduce regression into oversimplified layouts

5. Improve fallback artifact quality
   - fallback should still look intentional
   - no visible “demo” feel

### Likely Files

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/server/src/services/widget-engine.ts`
- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/server/src/services/run-orchestrator.ts`

### Exit Criteria

- fewer generic artifacts
- better first-pass widget quality
- fewer visible fallback-feeling results
- improved repair success quality

## Phase 3: ChatGPT-Native UX

### Objective

Make the app feel native to ChatGPT rather than like an embedded dev widget.

### Work Items

1. Simplify remaining operational-looking UI in edge states

2. Improve viewport and resize behavior across:
   - loading
   - preview
   - final widget
   - auth-required
   - reconnect
   - error

3. Improve follow-up actions from the artifact surface
   - better CTA placement
   - better prompt-forwarding affordances

4. Improve reconnect and post-reconnect flow
   - smoother re-entry
   - less abrupt context switching

### Likely Files

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/App.tsx`
- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/styles.css`

### Exit Criteria

- no awkward internal scrolling or clipping
- reconnect flow feels smooth
- app feels comfortable inside ChatGPT viewports

## Phase 4: Content and Evidence Presentation

### Objective

Make the answer, reasoning, and supporting evidence feel like one experience.

### Work Items

1. Improve citation styling and placement

2. Integrate citations more tightly into the artifact surface

3. Improve reasoning presentation
   - useful but less visually noisy
   - better milestone emphasis

4. Improve the relationship between:
   - streamed answer text
   - reasoning panel
   - final workspace

### Likely Files

- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/App.tsx`
- `/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/apps/widget/src/styles.css`

### Exit Criteria

- citations feel integrated
- reasoning is secondary but still useful
- answer and artifact feel coordinated

## Phase 5: Final Edge-State Polish

### Objective

Polish the remaining visible rough edges before wider usage.

### Work Items

1. Audit fallback mode

2. Audit auth-required and reconnect mode

3. Audit OpenAI widget-generation failure mode

4. Improve recovery messaging and CTAs

5. Run final visual QA across:
   - desktop
   - mobile
   - ChatGPT host layouts

### Exit Criteria

- edge states feel intentional
- failures are understandable
- UI remains stable across target viewports

## Recommended Execution Order

Recommended order:

1. shared token layer
2. shell/widget host visual unification
3. prompt-quality improvements
4. validation/repair improvements
5. fallback artifact quality
6. viewport/resize polish
7. evidence/reasoning polish
8. edge-state audit

## Suggested Delivery Sequence

### Slice A

- shared token layer
- shell/widget host unification

### Slice B

- `visualize_read_me` refinement
- `show_widget` refinement
- better repair loop

### Slice C

- fallback artifact polish
- citation integration
- reasoning cleanup

### Slice D

- resize and viewport cleanup
- reconnect flow cleanup
- final edge-state audit

## Definition of Remaining Polish Done

The remaining polish is considered complete when:

- shell and artifact host share one visual language
- generated artifacts are consistently stronger
- fallback mode still looks polished
- the app feels natural inside ChatGPT
- reasoning and citations are integrated cleanly
- reconnect, loading, and failure states look intentional
