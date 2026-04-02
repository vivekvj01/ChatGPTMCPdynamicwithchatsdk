import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { designTokens } from "@chatgpt-mcp-dynamic/shared";
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
    __DYNAMIC_WIDGET_CONFIG__?: {
      appBaseUrl?: string;
    };
  }
}

function getInitialRunId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("runId") || "";
}

function safeSerialize(value: unknown): string {
  const seen = new WeakSet<object>();

  try {
    return JSON.stringify(
      value,
      (_key, currentValue) => {
        if (typeof currentValue === "function") {
          return "[Function]";
        }
        if (typeof currentValue === "bigint") {
          return String(currentValue);
        }
        if (currentValue && typeof currentValue === "object") {
          if (seen.has(currentValue as object)) {
            return "[Circular]";
          }
          seen.add(currentValue as object);
        }
        return currentValue;
      },
      2
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `"[Unserializable: ${message}]"`;
  }
}

function normalizeBridgeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  try {
    return JSON.parse(safeSerialize(value)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function eventKey(event: StreamEvent): string {
  return `${event.type}:${event.timestamp}:${safeSerialize(event.payload)}`;
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
    const reportHeight = () => {
      const body = document.body;
      const doc = document.documentElement;
      const height = Math.max(
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0,
        doc ? doc.scrollHeight : 0,
        doc ? doc.offsetHeight : 0
      );
      parent.postMessage({ source: "dynamic-widget-bridge", type: "resize", height }, "*");
    };
    window.openLink = (url) => {
      parent.postMessage({ source: "dynamic-widget-bridge", type: "open-link", href: String(url || "") }, "*");
    };
    window.sendPrompt = (text) => {
      parent.postMessage({ source: "dynamic-widget-bridge", type: "send-prompt", prompt: String(text || "") }, "*");
    };
    window.addEventListener("load", () => {
      reportHeight();
      if ("ResizeObserver" in window) {
        const observer = new ResizeObserver(() => reportHeight());
        observer.observe(document.documentElement);
        if (document.body) {
          observer.observe(document.body);
        }
      } else {
        setInterval(reportHeight, 250);
      }
    });
    window.addEventListener("resize", reportHeight);
    setTimeout(reportHeight, 0);
    setTimeout(reportHeight, 100);
    setTimeout(reportHeight, 500);
  `;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://esm.sh; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://esm.sh; font-src https: data:; connect-src https:; frame-src 'none';" />
    <style>
      :root {
        --font-sans: "Geist", Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif;
        --font-serif: "Instrument Serif", Georgia, "Times New Roman", serif;
        --font-mono: "SF Mono", "Fira Code", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
      body { font-family: var(--font-sans); font-feature-settings: "cv03", "cv04", "cv11"; }
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
      if (typeof output.reconnectUrl === "string" && output.reconnectUrl.trim()) {
        reconnectUrl = output.reconnectUrl.trim();
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

function resolveApiBaseUrl(hostToolOutput: Record<string, unknown>): string {
  const explicitBaseUrl = String(hostToolOutput.apiBaseUrl || "").trim();
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  const runtimeBaseUrl = String(window.__DYNAMIC_WIDGET_CONFIG__?.appBaseUrl || "").trim();
  if (runtimeBaseUrl) {
    return runtimeBaseUrl;
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return window.location.origin;
  }

  return "";
}

function buildApiUrl(pathname: string, hostToolOutput: Record<string, unknown>): string {
  const baseUrl = resolveApiBaseUrl(hostToolOutput);
  if (!baseUrl) {
    return pathname;
  }

  return new URL(pathname, baseUrl).toString();
}

function toTitleCase(value: string): string {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatProviderLabel(provider: string): string {
  if (!provider) {
    return "Preparing";
  }

  if (provider === "openai") {
    return "OpenAI";
  }

  if (provider === "demo") {
    return "Fallback";
  }

  return toTitleCase(provider);
}

function buildWorkspaceFollowUps(query: string, hasCitations: boolean): string[] {
  const normalized = query.trim();
  const scopedQuery = normalized || "this result";

  return [
    `Go deeper on: ${scopedQuery}`,
    hasCitations
      ? `Summarize the strongest supporting evidence for ${scopedQuery}.`
      : `What is the strongest evidence behind ${scopedQuery}?`,
    `Turn ${scopedQuery} into a next-step plan.`
  ];
}

type StageItem = {
  label: string;
  state: "complete" | "active" | "pending";
};

function buildStageItems(args: {
  authRequired: boolean;
  hasReasoning: boolean;
  hasAnswer: boolean;
  hasWidget: boolean;
  widgetComplete: boolean;
}): StageItem[] {
  if (args.authRequired) {
    return [
      { label: "Connection", state: "active" },
      { label: "Grounded search", state: "pending" },
      { label: "Workspace", state: "pending" }
    ];
  }

  return [
    {
      label: "Grounded search",
      state: args.hasReasoning ? (args.hasAnswer ? "complete" : "active") : "pending"
    },
    {
      label: "Workspace preview",
      state: args.hasWidget ? (args.widgetComplete ? "complete" : "active") : args.hasAnswer ? "active" : "pending"
    },
    {
      label: "Final workspace",
      state: args.widgetComplete ? "complete" : args.hasWidget ? "active" : "pending"
    }
  ];
}

export function App() {
  const [runId, setRunId] = useState(getInitialRunId());
  const [query, setQuery] = useState("Show me the first slice of the dynamic workspace");
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [starting, setStarting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [widgetFrameHeight, setWidgetFrameHeight] = useState(480);
  const [retryToken, setRetryToken] = useState(0);
  const [hostToolInput, setHostToolInput] = useState<Record<string, unknown>>(() =>
    normalizeBridgeRecord(window.openai?.toolInput)
  );
  const [hostToolOutput, setHostToolOutput] = useState<Record<string, unknown>>(() =>
    normalizeBridgeRecord(window.openai?.toolOutput)
  );
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const derived = useMemo(() => deriveState(events), [events]);
  const shellVariables = useMemo(
    () =>
      ({
        "--font-sans": designTokens.fontSans,
        "--font-serif": designTokens.fontSerif,
        "--font-mono": designTokens.fontMono,
        "--color-bg": designTokens.colorBg,
        "--color-surface": designTokens.colorSurface,
        "--color-surface-soft": designTokens.colorSurfaceSoft,
        "--color-surface-hover": designTokens.colorSurfaceHover,
        "--color-border": designTokens.colorBorder,
        "--color-border-strong": designTokens.colorBorderStrong,
        "--color-text": designTokens.colorText,
        "--color-text-secondary": designTokens.colorTextSecondary,
        "--color-text-muted": designTokens.colorTextMuted,
        "--color-accent": designTokens.colorAccent,
        "--color-accent-soft": designTokens.colorAccentSoft,
        "--color-success": designTokens.colorSuccess,
        "--color-warning": designTokens.colorWarning,
        "--color-error": designTokens.colorError,
        "--shadow-card": designTokens.shadowCard,
        "--shadow-raised": designTokens.shadowRaised,
        "--spacing-xs": designTokens.spacingXs,
        "--spacing-sm": designTokens.spacingSm,
        "--spacing-md": designTokens.spacingMd,
        "--spacing-lg": designTokens.spacingLg,
        "--spacing-xl": designTokens.spacingXl,
        "--radius-card": designTokens.radiusCard,
        "--radius-inner": designTokens.radiusInner,
        "--panel-max-width": designTokens.panelMaxWidth
      }) as CSSProperties,
    []
  );
  const hostMode = Boolean(window.openai);
  const isRunning = derived.runStatus === "running";
  const hasStarted = Boolean(runId || events.length > 0);
  const streamLabel = connected ? "Live" : reconnecting ? "Reconnecting" : hasStarted ? "Idle" : "Ready";
  const statusLabel =
    derived.runStatus === "completed"
      ? derived.authRequired
        ? "Needs connection"
        : "Complete"
      : derived.runStatus === "error"
        ? "Needs attention"
        : isRunning
          ? "In progress"
          : toTitleCase(derived.runStatus);
  const widgetStatusLabel = derived.widgetComplete ? "Final workspace" : derived.widgetCode ? "Preview" : "Preparing";
  const moduleLabel =
    derived.modules.length > 0
      ? derived.modules.map((module) => toTitleCase(module)).join(", ")
      : "Selecting layout";
  const reasoningHighlights = derived.reasoning.slice(-6);
  const latestMilestone = reasoningHighlights.at(-1) || "";
  const primaryMessage = derived.text.trim();
  const answerParagraphs = primaryMessage
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const productTitle = hostMode ? "Agentforce Search" : "Dynamic Workspace";
  const heroTitle = derived.authRequired
    ? "Reconnect Salesforce to continue"
    : primaryMessage
      ? "Live pipeline analysis is underway"
      : "Grounded answers with dynamic workspaces";
  const heroCopy = derived.authRequired
    ? "We need a fresh Salesforce session before we can pull live opportunity data and compute risk."
    : primaryMessage
      ? "The workspace below updates as the Search Agent gathers evidence and the UI composes itself."
      : "Run a grounded Salesforce query and let the app assemble an interactive workspace as results stream in.";
  const stageItems = buildStageItems({
    authRequired: derived.authRequired,
    hasReasoning: derived.reasoning.length > 0,
    hasAnswer: Boolean(primaryMessage),
    hasWidget: Boolean(derived.widgetCode),
    widgetComplete: derived.widgetComplete
  });
  const widgetNarrative = derived.widgetComplete
    ? "Grounded result translated into a finished interactive workspace."
    : derived.widgetCode
      ? "The structure is visible now while the final artifact finishes composing."
      : "Waiting for the widget engine to publish the first workspace draft.";
  const workspaceFollowUps = buildWorkspaceFollowUps(query, derived.citations.length > 0);

  async function handleReconnectSalesforce() {
    if (derived.reconnectUrl) {
      if (window.openai?.openExternal) {
        await window.openai.openExternal({ href: derived.reconnectUrl, redirectUrl: false });
      } else {
        window.open(derived.reconnectUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    if (!window.openai?.callTool) {
      return;
    }

    const result = await window.openai.callTool("connect_salesforce", {});
    const structured = (result?.structuredContent || {}) as Record<string, unknown>;
    const reconnectUrl = String(structured.reconnectUrl || "").trim();
    if (!reconnectUrl) {
      throw new Error("No reconnect URL was returned by the ChatGPT host.");
    }

    if (window.openai?.openExternal) {
      await window.openai.openExternal({ href: reconnectUrl, redirectUrl: false });
    } else {
      window.open(reconnectUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function handleFollowUp(prompt: string) {
    if (!prompt.trim()) {
      return;
    }

    if (window.openai?.sendFollowUpMessage) {
      await window.openai.sendFollowUpMessage({
        prompt,
        scrollToBottom: true
      });
      return;
    }

    setQuery(prompt);
  }

  async function handleResumeRun() {
    if (runId && derived.runStatus === "running") {
      setRetryToken((value) => value + 1);
      return;
    }

    await handleStartRun();
  }

  async function loadSnapshot(targetRunId: string): Promise<RunSnapshotResult | null> {
    const response = await fetch(buildApiUrl(`/api/runs/${targetRunId}/snapshot`, hostToolOutput));
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
    const structured = normalizeBridgeRecord(result?.structuredContent);
    const nextRunId = extractRunId(structured);
    if (!nextRunId) {
      throw new Error("ChatGPT host did not return a runId.");
    }

    setHostToolOutput(structured);
    setRunId(nextRunId);
    setRetryToken(0);
  }

  async function startRunViaLocalApi() {
    const response = await fetch(buildApiUrl("/api/runs", hostToolOutput), {
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
    setConnectionError("");

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

    await fetch(buildApiUrl(`/api/runs/${runId}/cancel`, hostToolOutput), { method: "POST" });
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
        setHostToolInput(normalizeBridgeRecord(nextToolInput));
        const nextQuery = extractQuery(nextToolInput);
        if (nextQuery) {
          setQuery(nextQuery);
        }
      }

      if (nextToolOutput) {
        setHostToolOutput(normalizeBridgeRecord(nextToolOutput));
        const nextRunId = extractRunId(nextToolOutput);
        if (nextRunId) {
          setRunId(nextRunId);
        }
      }
    }

    function handleHostMessage(event: MessageEvent<HostToolResultMessage | Record<string, unknown>>) {
      if (event.source === frameRef.current?.contentWindow) {
        const data = event.data as Record<string, unknown>;
        if (data?.source === "dynamic-widget-bridge" && data.type === "resize") {
          const nextHeight = Number(data.height || 0);
          if (Number.isFinite(nextHeight) && nextHeight > 0) {
            setWidgetFrameHeight(Math.max(240, Math.ceil(nextHeight) + 8));
          }
          return;
        }

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
        const toolInput = normalizeBridgeRecord(message.params || {});
        setHostToolInput(toolInput);
        const nextQuery = extractQuery(toolInput);
        if (nextQuery) {
          setQuery(nextQuery);
        }
      }

      if (message.method === "ui/notifications/tool-result") {
        const structuredContent = normalizeBridgeRecord(message.params?.structuredContent || {});
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
        setConnectionError("");
        const snapshot = await loadSnapshot(runId);
        if (cancelled) {
          return;
        }

        if (snapshot && snapshot.status !== "running") {
          setConnected(false);
          setReconnecting(false);
          return;
        }

        source = new EventSource(buildApiUrl(`/api/runs/${runId}/stream`, hostToolOutput));
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
                setConnectionError("Stream disconnected. Retrying connection to the app backend.");
                retryTimeout = window.setTimeout(() => {
                  setRetryToken((value) => value + 1);
                }, 1200);
              } else {
                setReconnecting(false);
                setConnectionError("");
              }
            })
            .catch((error) => {
              if (cancelled) {
                return;
              }
              const message = error instanceof Error ? error.message : String(error);
              setConnectionError(`Unable to reach the app backend: ${message}`);
              retryTimeout = window.setTimeout(() => {
                setRetryToken((value) => value + 1);
              }, 1500);
            });
        };
      } catch (error) {
        if (cancelled) {
          return;
        }
        setReconnecting(false);
        const message = error instanceof Error ? error.message : String(error);
        setConnectionError(`Failed to start the live stream: ${message}`);
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
  }, [hostToolOutput, retryToken, runId]);

  useEffect(() => {
    setWidgetFrameHeight(480);
  }, [derived.widgetCode, derived.widgetTitle]);

  useEffect(() => {
    if (window.openai?.notifyIntrinsicHeight) {
      try {
        window.openai.notifyIntrinsicHeight(document.documentElement.scrollHeight);
      } catch (_error) {
        // Ignore host bridge sizing errors so the widget still renders.
      }
    }
  }, [connected, derived, events.length, hostToolInput, hostToolOutput, runId]);

  return (
    <main className="app-shell" style={shellVariables}>
      <header className="hero">
        <div className="hero-topline">
          <p className="eyebrow">{productTitle}</p>
          <span className={`hero-chip ${derived.authRequired ? "warning" : derived.widgetComplete ? "complete" : ""}`}>
            {widgetStatusLabel}
          </span>
        </div>
        <h1>{heroTitle}</h1>
        <p className="copy">{heroCopy}</p>
      </header>

      <section className="panel">
        <div className="composer">
          <label className="field">
            <span>Question</span>
            <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={3} />
          </label>
          <div className="actions">
            <button type="button" onClick={handleStartRun} disabled={starting}>
              {starting ? "Starting..." : hostMode ? "Run in ChatGPT" : "Start run"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={handleCancelRun}
              disabled={!runId || derived.runStatus !== "running"}
            >
              Stop run
            </button>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Run status</span>
          <strong className="metric-value">{statusLabel}</strong>
          <p className="metric-copy">{runId ? `Run ID ${runId.slice(0, 12)}...` : "Waiting for a run to start."}</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Connection</span>
          <strong className="metric-value">{streamLabel}</strong>
          <p className="metric-copy">{hostMode ? "Connected through ChatGPT" : "Running in local browser mode"}</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Widget engine</span>
          <strong className="metric-value">{formatProviderLabel(derived.provider)}</strong>
          <p className="metric-copy">{moduleLabel}</p>
        </article>
      </section>

      <section className="panel progress-panel">
        <div className="section-heading">
          <h2>Run flow</h2>
          <span className="status-pill">{derived.authRequired ? "Needs sign-in" : widgetStatusLabel}</span>
        </div>
        <div className="stage-rail" aria-label="Run progress">
          {stageItems.map((item) => (
            <div key={item.label} className={`stage-chip ${item.state}`}>
              <span className="stage-dot" aria-hidden="true"></span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {derived.authRequired ? (
        <section className="panel auth-panel">
          <div className="section-heading">
            <h2>Salesforce connection needed</h2>
            <span className="status-pill warning">Action needed</span>
          </div>
          <p className="text-output auth-copy">
            Connect Salesforce to pull live opportunity data, compute pipeline risk, and finish the workspace.
          </p>
          <div className="actions">
            {derived.reconnectUrl ? (
              <a className="link-button" href={derived.reconnectUrl} target="_blank" rel="noreferrer">
                Reconnect Salesforce
              </a>
            ) : hostMode ? (
              <button type="button" className="secondary" onClick={() => void handleReconnectSalesforce()}>
                Reconnect Salesforce
              </button>
            ) : null}
            <button type="button" className="secondary" onClick={() => void handleResumeRun()}>
              Resume analysis
            </button>
          </div>
        </section>
      ) : null}

      <section className="grid">
        <section className="panel">
          <div className="section-heading">
            <h2>Live progress</h2>
            <span className={`status-pill ${connected ? "live" : reconnecting ? "muted" : ""}`}>{streamLabel}</span>
          </div>
          {latestMilestone ? (
            <div className="milestone-banner">
              <span className="milestone-label">Latest milestone</span>
              <span className="milestone-copy">{latestMilestone}</span>
            </div>
          ) : null}
          {reasoningHighlights.length > 0 ? (
            <ul className="stream-list">
              {reasoningHighlights.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          ) : isRunning ? (
            <p className="empty">Connecting to Salesforce and preparing the grounded search stream.</p>
          ) : (
            <p className="empty">Run a question to see the search agent gather evidence step by step.</p>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>Answer</h2>
            <span className="status-pill">{derived.citations.length > 0 ? `${derived.citations.length} sources` : "Streaming"}</span>
          </div>
          {primaryMessage ? (
            <div className="answer-stack">
              <div className="answer-kicker">Grounded summary</div>
              <div className="answer-copy">
                {answerParagraphs.map((paragraph, index) => (
                  <p key={`${paragraph}-${index}`} className="text-output">
                    {paragraph}
                  </p>
                ))}
              </div>
              {derived.citations.length > 0 ? (
                <div className="citations compact">
                  {derived.citations.slice(0, 4).map((citation) => (
                    <a
                      key={`${citation.label}:${citation.url}:answer`}
                      className="citation-link"
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {citation.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : isRunning ? (
            <div className="placeholder-stack" aria-hidden="true">
              <span className="placeholder-line long"></span>
              <span className="placeholder-line medium"></span>
              <span className="placeholder-line short"></span>
            </div>
          ) : (
            <p className="empty">Grounded answer text will appear here as the run progresses.</p>
          )}
          {connectionError ? <p className="error">{connectionError}</p> : null}
          {derived.toolError ? <p className="error">{derived.toolError}</p> : null}
        </section>
      </section>

      <section className="panel">
        <div className="widget-head">
          <div>
            <h2>{derived.widgetTitle || "Analysis workspace"}</h2>
            <p className="widget-subtitle">
              {derived.widgetComplete
                ? "Interactive workspace assembled from the latest grounded result."
                : derived.widgetCode
                  ? "Previewing the workspace while the final artifact is still composing."
                  : "The workspace will appear here as soon as the widget engine publishes it."}
            </p>
          </div>
          <span className={derived.widgetComplete ? "badge complete" : "badge"}>
            {widgetStatusLabel}
          </span>
        </div>
        <div className="artifact-shell">
          <div className="artifact-topbar">
            <div className="artifact-meta">
              <span className="artifact-kicker">Dynamic artifact</span>
              <span className="artifact-copy">{widgetNarrative}</span>
            </div>
            {derived.provider ? (
              <span className="artifact-engine">{toTitleCase(derived.provider)}</span>
            ) : null}
          </div>
          {derived.widgetCode ? (
            <div className={`widget-stage ${derived.widgetComplete ? "final" : "preview"}`}>
              <iframe
                ref={frameRef}
                className="widget-frame"
                sandbox="allow-scripts allow-popups"
                srcDoc={buildWidgetDocument(derived.widgetCode)}
                title={derived.widgetTitle || "Generated widget"}
                style={{ height: `${widgetFrameHeight}px` }}
              />
              {!derived.widgetComplete ? (
                <div className="widget-overlay">
                  <span className="widget-overlay-pill">Composing final workspace</span>
                </div>
              ) : null}
            </div>
          ) : isRunning ? (
            <div className="widget-loading-state" aria-hidden="true">
              <div className="widget-loading-hero"></div>
              <div className="widget-loading-grid">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <div className="widget-loading-panel"></div>
            </div>
          ) : (
            <p className="empty">Start a run to generate a live workspace for this question.</p>
          )}
          {derived.widgetCode || primaryMessage ? (
            <div className="artifact-footer">
              <div className="artifact-footer-grid">
                <div>
                  <p className="artifact-footer-label">Continue the thread</p>
                  <div className="artifact-actions">
                    {workspaceFollowUps.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="secondary action-chip"
                        onClick={() => void handleFollowUp(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
                {derived.citations.length > 0 ? (
                  <div>
                    <p className="artifact-footer-label">Supporting references</p>
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
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {(connectionError || derived.toolError) && !derived.authRequired ? (
        <section className="panel error-panel">
          <div className="section-heading">
            <h2>Recovery</h2>
            <span className="status-pill warning">Needs attention</span>
          </div>
          <p className="copy">
            {connectionError || derived.toolError || "The run hit an issue before the workspace fully settled."}
          </p>
          <div className="actions">
            <button type="button" onClick={() => void handleResumeRun()}>
              Retry run
            </button>
            {derived.reconnectUrl ? (
              <a className="link-button" href={derived.reconnectUrl} target="_blank" rel="noreferrer">
                Refresh Salesforce
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      <details className="panel diagnostics">
        <summary>Technical details</summary>
        <div className="diagnostics-grid">
          <section>
            <h2>Host payload</h2>
            <pre>{safeSerialize({ toolInput: hostToolInput, toolOutput: hostToolOutput })}</pre>
          </section>
          <section>
            <h2>Event log</h2>
            <pre>{safeSerialize(events)}</pre>
          </section>
        </div>
      </details>
    </main>
  );
}
