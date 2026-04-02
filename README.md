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

This repo currently contains the build-ready documentation set. The next implementation step is to scaffold:

1. MCP server
2. Cloud Run service
3. run orchestration + SSE streaming
4. iframe renderer
5. widget generation and repair loop

## Reference Codebases

- Shared auth pattern: `/Users/vivek.viswanathan/Desktop/FinalChatGPTApp`
- Dynamic widget and streaming patterns: `/Users/vivek.viswanathan/Desktop/Anushlatest code`

