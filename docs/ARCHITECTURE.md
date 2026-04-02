# Architecture

## Overview

This app is a ChatGPT-native dynamic UI application built with:

- Apps SDK + MCP
- Cloud Run
- custom iframe React UI
- backend SSE streaming
- model-generated widget HTML/CSS/JS

The app is designed to run inside ChatGPT while preserving a rich streaming experience similar to `Anushlatest code`.

## Architectural Goals

- Live entirely inside ChatGPT
- Reuse the existing shared auth service from `FinalChatGPTApp`
- Support message and streaming backend flows
- Stream reasoning, text, tool progress, and widget previews
- Generate dynamic UI using model-authored widget code
- Preserve a safe-enough execution boundary using iframe sandboxing and CSP

## Major Components

### 1. ChatGPT Host

ChatGPT invokes the app through MCP and mounts the app widget inside an iframe.

Responsibilities:

- invoke app tools
- display tool-connected UI
- host the iframe widget

### 2. MCP Server

The MCP server is the integration layer between ChatGPT and the backend.

Responsibilities:

- expose ChatGPT app tools
- start dynamic runs
- return widget metadata and initial run state
- provide auth-aware responses when Salesforce is not connected

### 3. Auth Adapter

The auth adapter wraps the shared auth service already used by `FinalChatGPTApp`.

Responsibilities:

- session lookup
- connect URL lookup
- query/message pass-through
- ChatGPT identity mapping

Identity strategy:

```text
chatgpt:<chatgptUsername>
```

### 4. Run Orchestrator

The run orchestrator owns the lifecycle of a single dynamic execution.

Responsibilities:

- create `runId`
- store active runs
- buffer stream events
- support stream replay
- support cancellation
- expire old runs

This should mirror the event-oriented pattern used in `Anushlatest code`.

### 5. Widget Generation Service

This service drives the dynamic UI generation flow.

Responsibilities:

- load visual guidance via `visualize_read_me`
- generate widget HTML/CSS/JS via `show_widget`
- stream partial widget previews
- validate widget code
- run repair flow when validation fails

### 6. SSE Stream Service

The stream service delivers live run updates to the iframe.

Responsibilities:

- expose `GET /api/runs/:runId/stream`
- replay historical events to reconnecting clients
- push live events until run completion

### 7. Iframe Renderer

The iframe renderer is a custom React application.

Responsibilities:

- connect to the run stream
- render reasoning and text updates
- render partial widget previews
- finalize and execute widget code
- bridge helper actions such as `sendPrompt` and `openLink`
- resize to content height

## End-to-End Runtime Flow

1. User asks a question in ChatGPT.
2. ChatGPT invokes the MCP tool `start_dynamic_run`.
3. Backend resolves auth and creates a new `runId`.
4. MCP returns initial output with widget template metadata.
5. ChatGPT mounts the iframe widget.
6. The iframe connects to `/api/runs/:runId/stream`.
7. Backend emits:
   - reasoning steps
   - text chunks
   - tool progress
   - widget preview updates
8. The widget generation service emits a partial `widget_code`.
9. The iframe renders preview content.
10. Backend validates the widget code.
11. If validation fails, the repair pass regenerates the widget.
12. Final widget is rendered and the run completes.

## Why Custom Iframe + SSE

Apps SDK gives ChatGPT-native app embedding, but the rich event-by-event streaming behavior should be owned by our backend and iframe.

This approach gives us:

- ChatGPT-native placement
- Anush-style streaming UX
- freedom to render progressive widget previews
- full control over widget execution and repair

## UI Strategy

The app intentionally uses a looser UI strategy.

Instead of fixed widget templates as the primary rendering path, the model generates:

- HTML
- CSS
- inline JS
- allowlisted external scripts when necessary

Guardrails:

- syntax validation
- repair loop
- iframe sandbox
- CSP allowlist

This is closer to the current `Anushlatest code` model than a strict typed-schema renderer.

## Security Boundary

The widget runs inside a sandboxed iframe with scripts allowed.

Security controls:

- no `allow-same-origin`
- CSP allowlist for script, connect, and resource domains
- no unrestricted nested frames by default
- no full-document shell from the model
- backend validation and repair before finalization

This is intentionally not a strict sanitization-first architecture. It is a guardrail-based model that favors flexibility.

## Deployment Topology

Single primary deployment target:

- `Cloud Run`

Recommended deployment units:

- one service for MCP + API + stream endpoints in the first version
- optional later split if scale or isolation requires it

## Key Architectural Decisions

### Decision 1: Use Apps SDK + MCP

Reason:

- native ChatGPT integration
- best fit for an in-ChatGPT product

### Decision 2: Use a custom iframe UI

Reason:

- full control over progressive rendering
- supports Anush-style event streaming

### Decision 3: Use backend SSE for streaming

Reason:

- predictable event pipeline
- aligns with existing reference implementation patterns

### Decision 4: Allow model-generated widget code

Reason:

- matches desired dynamic UI behavior
- more expressive than fixed templates

### Decision 5: Validate and repair instead of strict template-only rendering

Reason:

- preserves flexibility
- stays close to the proven reference approach

## Risks

- generated widget code may fail or behave unexpectedly
- app review may scrutinize script execution
- debugging dynamic widget failures is harder than debugging typed UI specs
- streaming adds coordination complexity between MCP, backend, and iframe

## Mitigations

- validation + repair loop
- CSP allowlist
- strong run logging and widget failure telemetry
- replayable stream state
- assistant text fallback when widget generation fails

