import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  Citation,
  RunSnapshotResult,
  StartDynamicRunResult,
  StreamEvent
} from "@chatgpt-mcp-dynamic/shared";

type OpenAiBridge = {
  toolInput?: Record<string, unknown>;
  toolOutput?: Record<string, unknown>;
  callTool?: (name: string, args?: Record<string, unknown>) => Promise<{
    structuredContent?: Record<string, unknown>;
    content?: unknown[];
    _meta?: Record<string, unknown>;
  }>;
  sendFollowUpMessage?: (args: { prompt: string; scrollToBottom?: boolean }) => Promise<void>;
  openExternal?: (args: { href: string; redirectUrl?: boolean }) => Promise<void>;
  notifyIntrinsicHeight?: (height?: number) => void;
};

type OpenAiGlobalsEvent = CustomEvent<{
  globals?: {
    toolInput?: Record<string, unknown>;
    toolOutput?: Record<string, unknown>;
  };
}>;

type HostToolResultMessage = {
  jsonrpc?: string;
  method?: string;
  params?: {
    structuredContent?: Record<string, unknown>;
    content?: unknown[];
    _meta?: Record<string, unknown>;
  };
};

declare global {
  interface Window {
    openai?: OpenAiBridge;
  }
}

function getInitialRunId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("runId") || "";
}

function eventKey(event: StreamEvent): string {
  return `${event.type}:${event.timestamp}:${JSON.stringify(event.payload)}`;
}

function mergeEvents(current: StreamEvent[], incoming: StreamEvent[]): StreamEvent[] {
  const seen = new Set(current.map((event) => eventKey(event)));
  const next = [...current];

  for (const event of incoming) {
    const key = eventKey(event);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(event);
  }

  return next;
}

function buildWidgetDocument(widgetCode: string): string {
  const safeCode = widgetCode.replace(/<\/script/gi, "<\\/script");
  const bridgeScript = `
    window.openLink = (url) => {
      parent.postMessage({ source: "dynamic-widget-bridge", type: "open-link", href: String(url || "") }, "*");
    };
    window.sendPrompt = (text) => {
      parent.postMessage({ source: "dynamic-widget-bridge", type: "send-prompt", prompt: String(text || "") }, "*");
    };
  `;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://esm.sh; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://esm.sh; font-src https: data:; connect-src https:; frame-src 'none';" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      body { font-family: Inter, system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <script>${bridgeScript}<\/script>
    ${safeCode}
  </body>
</html>`;
}

type DerivedState = {
  runStatus: string;
  reasoning: string[];
  text: string;
  widgetTitle: string;
  widgetCode: string;
  widgetComplete: boolean;
  toolError: string;
  provider: string;
  modules: string[];
  citations: Citation[];
  authRequired: boolean;
  reconnectUrl: string;
};

function deriveState(events: StreamEvent[]): DerivedState {
  const reasoning: string[] = [];
  let text = "";
  let widgetTitle = "";
  let widgetCode = "";
  let widgetComplete = false;
  let runStatus = "running";
  let toolError = "";
  let provider = "";
  let modules: string[] = [];
  let citations: Citation[] = [];
  let authRequired = false;
  let reconnectUrl = "";

  for (const event of events) {
    if (event.type === "reasoning-delta") {
      const delta = String(event.payload.delta || "").trim();
      if (delta) {
        reasoning.push(delta);
      }
    }

    if (event.type === "text-delta") {
      text += String(event.payload.delta || "");
    }

    if (event.type === "tool-output-available") {
      const output = (event.payload.output || {}) as Record<string, unknown>;
      if (typeof output.provider === "string") {
        provider = output.provider;
      }
      if (Array.isArray(output.modules)) {
        modules = output.modules.map((module) => String(module));
      }
      if (Array.isArray(output.citations)) {
        citations = output.citations
          .filter((item) => item && typeof item === "object")
          .map((item) => {
            const citation = item as Record<string, unknown>;
            return {
              label: String(citation.label || "Reference"),
              url: String(citation.url || "")
            };
          })
          .filter((citation) => citation.url);
      }
      const nextWidgetCode = String(output.widget_code || "").trim();
      if (nextWidgetCode) {
        widgetTitle = String(output.title || widgetTitle || "Generated Widget");
        widgetCode = nextWidgetCode;
        widgetComplete = Boolean(output.complete);
      }
    }

    if (event.type === "tool-output-error") {
      toolError = String(event.payload.errorText || "");
    }

    if (event.type === "run-complete") {
      runStatus = String(event.payload.status || "completed");
      authRequired = Boolean(event.payload.authRequired);
      reconnectUrl = String(event.payload.reconnectUrl || "");
    }

    if (event.type === "run-error") {
      runStatus = "error";
      toolError = String(event.payload.message || toolError);
    }
  }

  return {
    runStatus,
    reasoning,
    text,
    widgetTitle,
    widgetCode,
    widgetComplete,
    toolError,
    provider,
    modules,
    citations,
    authRequired,
    reconnectUrl
  };
}

function extractRunId(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  return String((value as Record<string, unknown>).runId || "").trim();
}

function extractQuery(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  return String((value as Record<string, unknown>).query || "").trim();
}

export function App() {
  const [runId, setRunId] = useState(getInitialRunId());
  const [query, setQuery] = useState("Show me the first slice of the dynamic workspace");
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [starting, setStarting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [hostToolInput, setHostToolInput] = useState<Record<string, unknown>>(
    window.openai?.toolInput || {}
  );
  const [hostToolOutput, setHostToolOutput] = useState<Record<string, unknown>>(
    window.openai?.toolOutput || {}
  );
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const derived = useMemo(() => deriveState(events), [events]);
  const hostMode = Boolean(window.openai);

  async function loadSnapshot(targetRunId: string): Promise<RunSnapshotResult | null> {
    const response = await fetch(`/api/runs/${targetRunId}/snapshot`);
    if (response.status === 404) {
      return null;
    }

    const payload = (await response.json()) as RunSnapshotResult | { error?: string };
    if (!response.ok) {
      throw new Error(String((payload as { error?: string }).error || "Failed to load snapshot."));
    }

    setEvents((current) => mergeEvents(current, (payload as RunSnapshotResult).events));
    return payload as RunSnapshotResult;
  }

  async function startRunViaHost() {
    const result = await window.openai?.callTool?.("start_dynamic_run", { query });
    const structured = (result?.structuredContent || {}) as Record<string, unknown>;
    const nextRunId = extractRunId(structured);
    if (!nextRunId) {
      throw new Error("ChatGPT host did not return a runId.");
    }

    setHostToolOutput(structured);
    setRunId(nextRunId);
    setRetryToken(0);
  }

  async function startRunViaLocalApi() {
    const response = await fetch("/api/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        chatgptUsername: "local-dev"
      })
    });

    const result = (await response.json()) as StartDynamicRunResult | { error?: string };
    if (!response.ok) {
      throw new Error(String((result as { error?: string }).error || "Failed to start run."));
    }

    const nextRunId = (result as StartDynamicRunResult).runId;
    setRunId(nextRunId);
    setRetryToken(0);
    window.history.replaceState({}, "", `?runId=${encodeURIComponent(nextRunId)}`);
  }

  async function handleStartRun() {
    setStarting(true);
    setEvents([]);
    setConnected(false);

    try {
      if (window.openai?.callTool) {
        await startRunViaHost();
      } else {
        await startRunViaLocalApi();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setEvents([
        {
          type: "run-error",
          runId: "local",
          timestamp: new Date().toISOString(),
          payload: { message }
        }
      ]);
    } finally {
      setStarting(false);
    }
  }

  async function handleCancelRun() {
    if (!runId) {
      return;
    }

    await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
    await loadSnapshot(runId).catch(() => null);
  }

  useEffect(() => {
    const initialHostRunId = extractRunId(window.openai?.toolOutput);
    const initialHostQuery = extractQuery(window.openai?.toolInput) || extractQuery(window.openai?.toolOutput);

    if (initialHostRunId) {
      setRunId(initialHostRunId);
    }
    if (initialHostQuery) {
      setQuery(initialHostQuery);
    }

    function handleSetGlobals(event: Event) {
      const detail = (event as OpenAiGlobalsEvent).detail;
      const nextToolInput = detail?.globals?.toolInput;
      const nextToolOutput = detail?.globals?.toolOutput;

      if (nextToolInput) {
        setHostToolInput(nextToolInput);
        const nextQuery = extractQuery(nextToolInput);
        if (nextQuery) {
          setQuery(nextQuery);
        }
      }

      if (nextToolOutput) {
        setHostToolOutput(nextToolOutput);
        const nextRunId = extractRunId(nextToolOutput);
        if (nextRunId) {
          setRunId(nextRunId);
        }
      }
    }

    function handleHostMessage(event: MessageEvent<HostToolResultMessage | Record<string, unknown>>) {
      if (event.source === frameRef.current?.contentWindow) {
        const data = event.data as Record<string, unknown>;
        if (data?.source === "dynamic-widget-bridge" && data.type === "send-prompt") {
          const prompt = String(data.prompt || "").trim();
          if (prompt) {
            if (window.openai?.sendFollowUpMessage) {
              void window.openai.sendFollowUpMessage({ prompt });
            } else {
              setQuery(prompt);
            }
          }
          return;
        }

        if (data?.source === "dynamic-widget-bridge" && data.type === "open-link") {
          const href = String(data.href || "").trim();
          if (!href) {
            return;
          }
          if (window.openai?.openExternal) {
            void window.openai.openExternal({ href, redirectUrl: false });
          } else {
            window.open(href, "_blank", "noopener,noreferrer");
          }
          return;
        }
      }

      if (event.source !== window.parent) {
        return;
      }

      const message = event.data as HostToolResultMessage;
      if (!message || message.jsonrpc !== "2.0") {
        return;
      }

      if (message.method === "ui/notifications/tool-input") {
        const toolInput = (message.params || {}) as Record<string, unknown>;
        setHostToolInput(toolInput);
        const nextQuery = extractQuery(toolInput);
        if (nextQuery) {
          setQuery(nextQuery);
        }
      }

      if (message.method === "ui/notifications/tool-result") {
        const structuredContent = (message.params?.structuredContent || {}) as Record<string, unknown>;
        setHostToolOutput(structuredContent);
        const nextRunId = extractRunId(structuredContent);
        if (nextRunId) {
          setRunId(nextRunId);
        }
      }
    }

    window.addEventListener("openai:set_globals", handleSetGlobals as EventListener, {
      passive: true
    });
    window.addEventListener("message", handleHostMessage, { passive: true });

    return () => {
      window.removeEventListener("openai:set_globals", handleSetGlobals as EventListener);
      window.removeEventListener("message", handleHostMessage);
    };
  }, []);

  useEffect(() => {
    if (!runId) {
      return;
    }

    let cancelled = false;
    let source: EventSource | null = null;
    let retryTimeout: number | null = null;

    async function startStream() {
      try {
        setReconnecting(false);
        const snapshot = await loadSnapshot(runId);
        if (cancelled) {
          return;
        }

        if (snapshot && snapshot.status !== "running") {
          setConnected(false);
          setReconnecting(false);
          return;
        }

        source = new EventSource(`/api/runs/${runId}/stream`);
        source.onopen = () => {
          setConnected(true);
          setReconnecting(false);
        };
        source.onmessage = (event) => {
          const parsed = JSON.parse(event.data) as StreamEvent;
          setEvents((current) => mergeEvents(current, [parsed]));
        };
        source.onerror = () => {
          setConnected(false);
          source?.close();
          void loadSnapshot(runId)
            .then((nextSnapshot) => {
              if (cancelled) {
                return;
              }
              if (nextSnapshot?.status === "running") {
                setReconnecting(true);
                retryTimeout = window.setTimeout(() => {
                  setRetryToken((value) => value + 1);
                }, 1200);
              } else {
                setReconnecting(false);
              }
            })
            .catch(() => {
              if (cancelled) {
                return;
              }
              retryTimeout = window.setTimeout(() => {
                setRetryToken((value) => value + 1);
              }, 1500);
            });
        };
      } catch (_error) {
        if (cancelled) {
          return;
        }
        setReconnecting(false);
      }
    }

    void startStream();

    return () => {
      cancelled = true;
      setConnected(false);
      if (retryTimeout !== null) {
        window.clearTimeout(retryTimeout);
      }
      source?.close();
    };
  }, [retryToken, runId]);

  useEffect(() => {
    if (window.openai?.notifyIntrinsicHeight) {
      window.openai.notifyIntrinsicHeight(document.documentElement.scrollHeight);
    }
  }, [connected, derived, events.length, hostToolInput, hostToolOutput, runId]);

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">ChatGPT Dynamic UI</p>
        <h1>Widget Stream Shell</h1>
        <p className="copy">
          This widget can run locally or inside ChatGPT. In ChatGPT it initializes from host tool
          input and tool output, then streams live run events from the backend.
        </p>
      </header>

      <section className="panel">
        <div className="composer">
          <label className="field">
            <span>Query</span>
            <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={3} />
          </label>
          <div className="actions">
            <button type="button" onClick={handleStartRun} disabled={starting}>
              {starting ? "Starting..." : hostMode ? "Start Via ChatGPT" : "Start Run"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={handleCancelRun}
              disabled={!runId || derived.runStatus !== "running"}
            >
              Cancel Run
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="row">
          <strong>Mode</strong>
          <span>{hostMode ? "ChatGPT host" : "Local browser"}</span>
        </div>
        <div className="row">
          <strong>Run ID</strong>
          <span>{runId || "Waiting for tool output"}</span>
        </div>
        <div className="row">
          <strong>Stream</strong>
          <span>{connected ? "Connected" : reconnecting ? "Reconnecting" : "Disconnected"}</span>
        </div>
        <div className="row">
          <strong>Status</strong>
          <span>{derived.runStatus}</span>
        </div>
        <div className="row">
          <strong>Widget Provider</strong>
          <span>{derived.provider || "Pending"}</span>
        </div>
        <div className="row">
          <strong>Modules</strong>
          <span>{derived.modules.length > 0 ? derived.modules.join(", ") : "Pending"}</span>
        </div>
      </section>

      {derived.authRequired ? (
        <section className="panel auth-panel">
          <h2>Authentication Required</h2>
          <p className="text-output">
            The shared auth service reported that Salesforce needs to be connected before this run
            can continue.
          </p>
          {derived.reconnectUrl ? (
            <a className="link-button" href={derived.reconnectUrl} target="_blank" rel="noreferrer">
              Reconnect Salesforce
            </a>
          ) : null}
        </section>
      ) : null}

      <section className="grid">
        <section className="panel">
          <h2>Reasoning</h2>
          {derived.reasoning.length > 0 ? (
            <ul className="stream-list">
              {derived.reasoning.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="empty">Reasoning will appear here once a run starts.</p>
          )}
        </section>

        <section className="panel">
          <h2>Assistant Text</h2>
          {derived.text ? (
            <p className="text-output">{derived.text}</p>
          ) : (
            <p className="empty">No text streamed yet.</p>
          )}
          {derived.toolError ? <p className="error">{derived.toolError}</p> : null}
        </section>
      </section>

      {derived.citations.length > 0 ? (
        <section className="panel">
          <h2>References</h2>
          <div className="citations">
            {derived.citations.map((citation) => (
              <a
                key={`${citation.label}:${citation.url}`}
                className="citation-link"
                href={citation.url}
                target="_blank"
                rel="noreferrer"
              >
                {citation.label}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="widget-head">
          <h2>{derived.widgetTitle || "Generated Widget"}</h2>
          <span className={derived.widgetComplete ? "badge complete" : "badge"}>
            {derived.widgetComplete ? "Final" : "Preview"}
          </span>
        </div>
        {derived.widgetCode ? (
          <iframe
            ref={frameRef}
            className="widget-frame"
            sandbox="allow-scripts allow-popups"
            srcDoc={buildWidgetDocument(derived.widgetCode)}
            title={derived.widgetTitle || "Generated widget"}
          />
        ) : (
          <p className="empty">Widget preview will appear here when the backend emits it.</p>
        )}
      </section>

      <section className="panel">
        <h2>Host Globals</h2>
        <pre>{JSON.stringify({ toolInput: hostToolInput, toolOutput: hostToolOutput }, null, 2)}</pre>
      </section>

      <section className="panel">
        <h2>Raw Event Feed</h2>
        <pre>{JSON.stringify(events, null, 2)}</pre>
      </section>
    </main>
  );
}
