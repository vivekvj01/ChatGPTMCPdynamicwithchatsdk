# ChatGPT Dynamic UI App

This repo is the implementation plan and design baseline for a ChatGPT-native app that:

- lives inside ChatGPT using Apps SDK + MCP
- reuses the shared auth service from `FinalChatGPTApp`
- streams reasoning, text, tool progress, and widget previews
- renders model-generated HTML/CSS/JS widgets inside a custom iframe UI
- runs on Cloud Run

## Why This Architecture

The target product should live inside ChatGPT, not as a standalone app. The chosen architecture is:

- `Apps SDK + MCP` for ChatGPT-native integration
- `Cloud Run` for hosting
- `custom iframe React UI` for rendering and streaming UX
- `custom SSE backend` for Anush-style live updates
- `LLM-generated widget_code` for dynamic UI
- `validation + repair loop` for reliability

This intentionally follows a looser dynamic UI strategy similar to `Anushlatest code`, instead of limiting the app to fixed widget templates.

## Repo Structure

- [`docs/ARCHITECTURE.md`](/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/docs/ARCHITECTURE.md): system design, runtime flow, and architectural decisions
- [`docs/ENGINEERING_SPEC.md`](/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/docs/ENGINEERING_SPEC.md): API contracts, stream schema, MCP tool contracts, prompting, and validation behavior
- [`docs/IMPLEMENTATION_PLAN.md`](/Users/vivek.viswanathan/Desktop/ChatGPTAppChatKit/docs/IMPLEMENTATION_PLAN.md): milestone-based build plan and delivery order

## Product Goals

- Native ChatGPT experience
- Shared auth service reuse with minimal risk
- Rich streaming UI inside the widget iframe
- Dynamic model-generated UI similar to `Anushlatest code`
- Flexible path for charts, dashboards, explainers, and record detail views

## Non-Goals

- A standalone website-first chat product
- A strict typed-component renderer as the only rendering path
- A fixed-template-only UI strategy

## Current Status

This repo now includes the MVP implementation for the planned slices:

1. MCP server with `start_dynamic_run`
2. Cloud Run-style Express service shell
3. shared auth adapter and `agent/query` contract
4. run orchestration + SSE streaming
5. iframe renderer with reconnect and snapshot replay
6. widget generation, validation, and repair loop

The current implementation supports:

- `POST /api/runs`
- `GET /api/runs/:runId/stream`
- `GET /api/runs/:runId/snapshot`
- `POST /api/runs/:runId/cancel`
- `POST /mcp`
- demo fallback when shared auth or OpenAI credentials are absent
- OpenAI-backed widget generation when `OPENAI_API_KEY` is configured

Remaining follow-on work is optional product hardening rather than missing MVP slices:

- Cloud Run deployment and ChatGPT connection setup
- deeper auth/session durability if Redis or persistent storage is needed
- richer widget host bridges and review-time security hardening

## Testing

### Local

1. Copy `.env.example` to `.env` and fill any available values.
2. Run `npm install`.
3. Run `npm run build`.
4. Run `npm start`.
5. Verify:
   - `GET /healthz`
   - `POST /mcp` with `tools/list`
   - `POST /mcp` with `resources/list`
   - `POST /mcp` with `resources/read` for `ui://widget/dynamic-run.html`
6. For browser testing, open the widget dev app with `npm run dev:widget`.

### ChatGPT App

1. Deploy this repo to a public HTTPS URL, preferably Cloud Run.
2. Set `APP_BASE_URL` to the final public origin.
3. Build and start the app so `/mcp` and `/widget-assets/*` are available.
4. In ChatGPT, connect the MCP app using your deployed `/mcp` endpoint.
5. Invoke `start_dynamic_run` from ChatGPT and confirm that the iframe mounts `ui://widget/dynamic-run.html`.

## Reference Codebases

- Shared auth pattern: `/Users/vivek.viswanathan/Desktop/FinalChatGPTApp`
- Dynamic widget and streaming patterns: `/Users/vivek.viswanathan/Desktop/Anushlatest code`
