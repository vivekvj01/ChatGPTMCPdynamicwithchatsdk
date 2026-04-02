# Implementation Plan

## Delivery Strategy

Build the app in three milestones:

- foundation
- dynamic streaming UI
- production hardening

This sequence is designed to get a working ChatGPT-native demo quickly while preserving the looser Anush-style widget generation strategy.

## Milestone 1: Foundation

Goal:

- establish the base app shell, auth integration, and run lifecycle

Deliverables:

- Cloud Run service skeleton
- MCP server with `start_dynamic_run`
- shared auth adapter
- active run store
- `POST /api/runs`
- `GET /api/runs/:runId/stream`
- basic iframe widget mount

Acceptance criteria:

- ChatGPT can invoke the app
- a run is created successfully
- the iframe can open inside ChatGPT
- the iframe can subscribe to the stream

## Milestone 2: Dynamic Streaming UI

Goal:

- stream reasoning, text, and dynamic widget previews

Deliverables:

- event schema implementation
- reasoning/text/tool streaming
- `visualize_read_me` flow
- `show_widget` flow
- partial widget preview support
- widget validation
- repair flow
- final widget rendering inside the iframe

Acceptance criteria:

- reasoning appears incrementally
- assistant text streams incrementally
- partial widget preview is visible before completion
- final widget becomes interactive
- broken widget JS triggers repair

## Milestone 3: Reliability and Hardening

Goal:

- stabilize runtime behavior for production usage

Deliverables:

- reconnect and replay support
- `/api/runs/:runId/snapshot`
- cancel support
- auth-required widget state
- telemetry and metrics
- CSP hardening
- production logs and error classification

Acceptance criteria:

- stream reconnect works
- auth-required flow is user-friendly
- widget failures are observable
- run lifecycle is reliable under retry/disconnect conditions

## Recommended Work Breakdown

### Track A: Platform

Owner responsibilities:

- repo bootstrap
- Cloud Run deployment
- environment config
- app startup and health checks

### Track B: MCP and Auth

Owner responsibilities:

- MCP tool registration
- widget resource metadata
- auth adapter wrapping shared auth service
- reconnect flow

### Track C: Run Orchestration

Owner responsibilities:

- active run store
- event buffering
- subscriber lifecycle
- stream endpoint
- cancellation and replay

### Track D: Widget Generation

Owner responsibilities:

- prompting implementation
- `visualize_read_me`
- `show_widget`
- preview emission
- validation
- repair loop

### Track E: Iframe UI

Owner responsibilities:

- React widget shell
- SSE connection
- streamed state handling
- widget preview/final rendering
- helper action bridge
- resize behavior

## Suggested Calendar Plan

### Week 1

- initialize repo
- add docs and baseline package structure
- scaffold Cloud Run app
- implement auth adapter
- implement MCP tool skeleton

### Week 2

- implement run store
- implement SSE stream endpoint
- build iframe shell
- mount widget inside ChatGPT

### Week 3

- implement streaming reasoning/text states
- implement widget prompting flow
- support partial widget previews
- add validation and repair

### Week 4

- add reconnect/replay
- auth-required UI
- telemetry
- demo polish

## Environment Variables

Expected configuration:

- `PORT`
- `APP_BASE_URL`
- `SALESFORCE_AUTH_SERVICE_URL`
- `SALESFORCE_AUTH_SERVICE_SECRET`
- `SALESFORCE_LOGIN_URL`
- `SALESFORCE_AGENT_ID`
- `SALESFORCE_TENANT_ID`
- `SALESFORCE_REGION`
- `OPENAI_API_KEY` or equivalent model access configuration

## Open Implementation Decisions

- whether to keep active runs only in memory or back them with Redis
- whether to expose one MCP tool or separate orchestration/render tools
- whether to persist completed runs longer-term
- whether to add a typed UI spec fallback in a later release

## Definition of Done

The first release is done when:

- the app works inside ChatGPT
- auth reuses the existing shared auth service
- the iframe streams reasoning and text
- the model generates and streams widget previews
- final widgets run interactively
- validation and repair work for broken widget code
- reconnect and auth-required flows are usable

