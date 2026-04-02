# Engineering Spec

## Scope

This document defines the implementation contracts for the ChatGPT-native dynamic UI app.

It covers:

- MCP tool contracts
- HTTP API contracts
- SSE event schema
- run state model
- prompting contracts
- widget validation behavior
- renderer contract

## MCP Layer

### Tool: `start_dynamic_run`

Purpose:

- start a grounded run
- initialize auth state
- mount the dynamic widget UI in ChatGPT

Input schema:

```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string" },
    "conversationKey": { "type": "string" },
    "chatgptUsername": { "type": "string" },
    "loginUrl": { "type": "string" },
    "resetConversation": { "type": "boolean" }
  },
  "required": ["query"],
  "additionalProperties": false
}
```

Result payload:

```json
{
  "runId": "run_01HABC123",
  "status": "started",
  "query": "Show me Acme pipeline risk",
  "auth": {
    "connected": true,
    "reconnectUrl": null
  },
  "stream": {
    "path": "/api/runs/run_01HABC123/stream"
  },
  "widget": {
    "uri": "ui://widget/dynamic-run.html",
    "title": "Agent Workspace",
    "mode": "streaming"
  }
}
```

Recommended tool metadata:

```json
{
  "openai/outputTemplate": "ui://widget/dynamic-run.html",
  "openai/widgetAccessible": true,
  "openai/resultCanProduceWidget": true
}
```

### Tool: `connect_salesforce`

Purpose:

- return a connect or reconnect URL when auth is missing

Input schema:

```json
{
  "type": "object",
  "properties": {
    "chatgptUsername": { "type": "string" },
    "loginUrl": { "type": "string" }
  },
  "additionalProperties": false
}
```

Result payload:

```json
{
  "connected": false,
  "reconnectUrl": "https://..."
}
```

### Tool: `get_run_snapshot`

Purpose:

- retrieve a replayable snapshot for reconnect or recovery

Input schema:

```json
{
  "type": "object",
  "properties": {
    "runId": { "type": "string" }
  },
  "required": ["runId"],
  "additionalProperties": false
}
```

## Widget Resource Contract

Widget URI:

```text
ui://widget/dynamic-run.html
```

Widget metadata:

```json
{
  "openai/widgetDescription": "Streams grounded run progress and renders model-generated interactive UI.",
  "openai/widgetPrefersBorder": true,
  "openai/widgetCSP": {
    "connect_domains": [
      "https://<cloud-run-domain>"
    ],
    "resource_domains": [
      "https://<cloud-run-domain>",
      "https://cdnjs.cloudflare.com",
      "https://cdn.jsdelivr.net",
      "https://unpkg.com",
      "https://esm.sh"
    ]
  }
}
```

## HTTP API

### `POST /api/runs`

Purpose:

- create a new run outside of or behind the MCP tool layer

Request:

```json
{
  "query": "Show me Acme pipeline risk",
  "conversationKey": "conv_123",
  "chatgptUsername": "vivek",
  "loginUrl": "https://login.salesforce.com",
  "resetConversation": false
}
```

Response:

```json
{
  "runId": "run_01HABC123",
  "status": "started",
  "connected": true,
  "reconnectUrl": null
}
```

### `GET /api/runs/:runId/stream`

Purpose:

- open SSE stream for live updates

Headers:

```text
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
```

### `POST /api/runs/:runId/cancel`

Response:

```json
{
  "ok": true
}
```

### `GET /api/runs/:runId/snapshot`

Response:

```json
{
  "runId": "run_01HABC123",
  "status": "running",
  "events": []
}
```

### Auth Adapter Endpoints

Recommended internal routes:

- `GET /api/auth/session`
- `POST /api/auth/connect`
- `POST /api/auth/message`
- `POST /api/auth/stream`

These routes wrap the existing shared auth service contract.

## SSE Event Schema

All events use this envelope:

```json
{
  "type": "text-delta",
  "runId": "run_01HABC123",
  "timestamp": "2026-04-02T18:20:00.000Z",
  "payload": {}
}
```

Supported event types:

- `run-start`
- `reasoning-start`
- `reasoning-delta`
- `reasoning-end`
- `text-start`
- `text-delta`
- `text-end`
- `tool-input-start`
- `tool-input-available`
- `tool-output-available`
- `tool-output-error`
- `run-complete`
- `run-error`

### Example: reasoning event

```json
{
  "type": "reasoning-delta",
  "runId": "run_01HABC123",
  "timestamp": "2026-04-02T18:20:00.000Z",
  "payload": {
    "id": "reasoning_1",
    "delta": "Checking Salesforce auth.\n"
  }
}
```

### Example: text event

```json
{
  "type": "text-delta",
  "runId": "run_01HABC123",
  "timestamp": "2026-04-02T18:20:01.000Z",
  "payload": {
    "id": "text_1",
    "delta": "I found 4 opportunities "
  }
}
```

### Example: widget preview event

```json
{
  "type": "tool-output-available",
  "runId": "run_01HABC123",
  "timestamp": "2026-04-02T18:20:02.000Z",
  "payload": {
    "toolName": "show_widget",
    "toolCallId": "widget_1",
    "output": {
      "title": "acme_pipeline_risk",
      "widget_code": "<style>...</style><div>...</div><script>...</script>",
      "complete": false
    }
  }
}
```

### Example: widget final event

```json
{
  "type": "tool-output-available",
  "runId": "run_01HABC123",
  "timestamp": "2026-04-02T18:20:03.000Z",
  "payload": {
    "toolName": "show_widget",
    "toolCallId": "widget_1",
    "output": {
      "title": "acme_pipeline_risk",
      "widget_code": "<style>...</style><div>...</div><script>...</script>",
      "complete": true
    }
  }
}
```

## Run State Model

Suggested TypeScript shape:

```ts
type RunStatus = "running" | "completed" | "error" | "aborted";

type StreamEvent = {
  type: string;
  runId: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

type ActiveRun = {
  runId: string;
  status: RunStatus;
  query: string;
  events: StreamEvent[];
  subscribers: Set<(event: StreamEvent | null) => void>;
  abortController: AbortController;
  createdAt: number;
  expiresAt: number;
  auth: {
    connected: boolean;
    reconnectUrl?: string | null;
  };
};
```

## Auth Adapter Contract

Required methods:

```ts
getSharedSession(userId, { loginUrl? })
getConnectUrl(userId, { loginUrl? })
runSharedAgentQuery(userId, conversationKey, message, { loginUrl? })
```

Identity mapping:

```text
chatgpt:<chatgptUsername>
```

Auth required response shape:

```json
{
  "connected": false,
  "reconnectUrl": "https://..."
}
```

## Widget Generation Contract

### Step 1: Visual Guidance

Tool: `visualize_read_me`

Schema:

```json
{
  "type": "object",
  "properties": {
    "modules": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["interactive", "chart", "mockup", "diagram", "art", "slds2"]
      }
    }
  },
  "required": ["modules"],
  "additionalProperties": false
}
```

### Step 2: Widget Generation

Tool: `show_widget`

Schema:

```json
{
  "type": "object",
  "properties": {
    "i_have_seen_read_me": { "type": "boolean" },
    "title": { "type": "string" },
    "loading_messages": {
      "type": "array",
      "items": { "type": "string" }
    },
    "widget_code": { "type": "string" }
  },
  "required": ["i_have_seen_read_me", "title", "loading_messages", "widget_code"],
  "additionalProperties": false
}
```

Expected `widget_code`:

- fragment only
- no full document shell
- `<style>` first
- HTML content next
- `<script>` last
- inline JS permitted
- allowlisted external scripts permitted

## Prompting Contract

### Visual Guidance Prompt

Model should:

- infer smallest correct design module set
- choose modules based on prompt intent
- prefer `slds2` when Salesforce-native visuals are relevant

### Widget Prompt

Model should:

- produce production-quality inline widget code
- optimize for a broad, polished layout
- avoid bare or tiny generic layouts
- render only the visual fragment
- omit markdown and prose wrappers

### Repair Prompt

When validation fails, model should:

- preserve visual quality and interaction model
- repair invalid or incomplete script behavior
- reissue `show_widget`

## Validation Contract

Validation is guardrail-based, not strict sanitization-first.

Required checks:

- inline JS parses successfully
- `onload` handler references are defined
- widget code is non-empty

Behavior:

1. validate generated widget
2. if invalid, run repair flow
3. revalidate repaired widget
4. if still invalid, emit error and text fallback

## Renderer Contract

The iframe app must:

- read initial run metadata from ChatGPT tool output
- connect to `/api/runs/:runId/stream`
- maintain:
  - `reasoning`
  - `assistantText`
  - `draftWidgetCode`
  - `finalWidgetCode`
  - `runStatus`
  - `authState`
- render preview widget when `complete=false`
- render final widget when `complete=true`
- split scripts from HTML before execution
- execute scripts after mount
- support helper bridges:
  - `sendPrompt(text)`
  - `openLink(url)`
- auto-resize to content height

## Security Controls

Required controls:

- iframe sandbox with `allow-scripts`
- no `allow-same-origin`
- CSP allowlist for:
  - `cdnjs.cloudflare.com`
  - `cdn.jsdelivr.net`
  - `unpkg.com`
  - `esm.sh`
  - Cloud Run origin
- no arbitrary nested frames by default
- widget failures logged by run ID

## Error Handling

### Auth Missing

Return reconnect state and mount auth-required UI.

### Widget Failure

Emit `tool-output-error` and assistant fallback text.

### Stream Disconnect

Iframe should:

1. request `/api/runs/:runId/snapshot`
2. reconnect to `/stream`
3. replay missed state

## Observability

Log fields:

- `runId`
- `query`
- `chatgptUsername`
- `authConnected`
- `widgetGenerated`
- `widgetValidated`
- `widgetRepaired`
- `runDurationMs`
- `modelName`
- `errorCode`

Metrics:

- run success rate
- auth-required rate
- widget repair rate
- widget failure rate
- stream disconnect rate
- time to first reasoning event
- time to first widget preview
- time to final widget

