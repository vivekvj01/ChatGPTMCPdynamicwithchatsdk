import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
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

type TranscriptEntry =
  | {
      id: string;
      kind: "reasoning";
      title: string;
      items: string[];
      live: boolean;
    }
  | {
      id: string;
      kind: "answer";
      title: string;
      blocks: AnswerBlock[];
      citations: Citation[];
    }
  | {
      id: string;
      kind: "status";
      tone: "info" | "warning" | "error";
      title: string;
      body: string;
      actionLabel?: string;
    };

type ToolRailItem = {
  id: string;
  label: string;
  state: "pending" | "complete" | "error";
  summary: string;
};

type AnswerBlock =
  | {
      kind: "paragraph";
      text: string;
    }
  | {
      kind: "list";
      items: string[];
      ordered: boolean;
    }
  | {
      kind: "table";
      headers: string[];
      rows: string[][];
    };

function handleExternalLinkClick(event: ReactMouseEvent<HTMLAnchorElement>, href: string) {
  const nextHref = String(href || "").trim();
  if (!nextHref) {
    return;
  }

  if (window.openai?.openExternal) {
    event.preventDefault();
    void window.openai.openExternal({ href: nextHref, redirectUrl: false });
  }
}

function renderLinkedText(text: string, keyPrefix: string): ReactNode[] {
  const value = String(text || "");
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(value)) !== null) {
    const [fullMatch, label, href] = match;
    const start = match.index;
    if (start > lastIndex) {
      nodes.push(value.slice(lastIndex, start));
    }

    nodes.push(
      <a
        key={`${keyPrefix}-${start}`}
        className="inline-link"
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => handleExternalLinkClick(event, href)}
      >
        {label}
      </a>
    );
    lastIndex = start + fullMatch.length;
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [value];
}

function AnswerBlocksView({
  blocks,
  idPrefix,
  className = "message-copy"
}: {
  blocks: AnswerBlock[];
  idPrefix: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.kind === "paragraph") {
          return <p key={`${idPrefix}-${index}`}>{renderLinkedText(block.text, `${idPrefix}-${index}`)}</p>;
        }

        if (block.kind === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag key={`${idPrefix}-${index}`} className="answer-list">
              {block.items.map((item, itemIndex) => (
                <li key={`${idPrefix}-${index}-${itemIndex}`}>
                  {renderLinkedText(item, `${idPrefix}-${index}-${itemIndex}`)}
                </li>
              ))}
            </ListTag>
          );
        }

        return (
          <div key={`${idPrefix}-${index}`} className="answer-table-wrap">
            <table className="answer-table">
              <thead>
                <tr>
                  {block.headers.map((header, headerIndex) => (
                    <th key={`${idPrefix}-${index}-head-${headerIndex}`}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={`${idPrefix}-${index}-row-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${idPrefix}-${index}-row-${rowIndex}-cell-${cellIndex}`}>
                        {renderLinkedText(cell, `${idPrefix}-${index}-row-${rowIndex}-cell-${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

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
    let lastReportedHeight = 0;
    let settleTimer = null;
    const HEIGHT_CHANGE_THRESHOLD = 12;
    const reportHeight = () => {
      const body = document.body;
      const doc = document.documentElement;
      const height = Math.max(
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0,
        doc ? doc.scrollHeight : 0,
        doc ? doc.offsetHeight : 0
      );
      if (Math.abs(height - lastReportedHeight) < HEIGHT_CHANGE_THRESHOLD) {
        return;
      }
      lastReportedHeight = height;
      parent.postMessage({ source: "dynamic-widget-bridge", type: "resize", height }, "*");
    };
    const scheduleSettledHeightReport = () => {
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      settleTimer = setTimeout(() => {
        settleTimer = null;
        reportHeight();
      }, 350);
    };
    window.openLink = (url) => {
      parent.postMessage({ source: "dynamic-widget-bridge", type: "open-link", href: String(url || "") }, "*");
    };
    window.sendPrompt = (text) => {
      parent.postMessage({ source: "dynamic-widget-bridge", type: "send-prompt", prompt: String(text || "") }, "*");
    };
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      const href = String(anchor.href || "").trim();
      if (!href || href.startsWith("javascript:") || href.startsWith("#")) {
        return;
      }
      event.preventDefault();
      window.openLink(href);
    });
    window.addEventListener("load", () => {
      reportHeight();
      scheduleSettledHeightReport();
    });
    window.addEventListener("resize", scheduleSettledHeightReport);
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
      body > :not(script):first-child {
        background: transparent !important;
        border-color: transparent !important;
        box-shadow: none !important;
        border-radius: 0 !important;
      }
      body > :not(script):first-child > :first-child {
        background: transparent !important;
        border-color: transparent !important;
        box-shadow: none !important;
      }
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

function stripMarkdownDecoration(text: string): string {
  return String(text || "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[^`])`([^`]+)`/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

function isMarkdownFence(line: string): boolean {
  return /^```[\w-]*\s*$/i.test(line.trim());
}

function isMarkdownSeparator(line: string): boolean {
  return /^([-*_])\1{2,}\s*$/.test(line.trim());
}

function normalizeAnswerBlockLines(block: string): string[] {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isMarkdownFence(line))
    .filter((line) => !isMarkdownSeparator(line));
}

function splitPipeRow(row: string): string[] {
  return row
    .split("|")
    .map((cell) => stripMarkdownDecoration(cell))
    .filter((cell, index, parts) => !(parts.length > 1 && cell === "" && (index === 0 || index === parts.length - 1)));
}

function isMarkdownTable(block: string): boolean {
  const lines = normalizeAnswerBlockLines(block);

  if (lines.length < 2) {
    return false;
  }

  return /\|/.test(lines[0]) && /^[\s|:\-]+$/.test(lines[1]);
}

function parseTableBlock(block: string): AnswerBlock | null {
  const lines = normalizeAnswerBlockLines(block);

  if (!isMarkdownTable(block)) {
    return null;
  }

  const headers = splitPipeRow(lines[0]);
  const rows = lines
    .slice(2)
    .map((line) => splitPipeRow(line))
    .filter((row) => row.length > 0);

  if (headers.length === 0 || rows.length === 0) {
    return null;
  }

  return { kind: "table", headers, rows };
}

function parseListBlock(block: string): AnswerBlock | null {
  const lines = normalizeAnswerBlockLines(block);

  if (lines.length === 0) {
    return null;
  }

  const ordered = lines.every((line) => /^\d+\.\s+/.test(line));
  const unordered = lines.every((line) => /^[-*]\s+/.test(line));

  if (!ordered && !unordered) {
    return null;
  }

  return {
    kind: "list",
    ordered,
    items: lines
      .map((line) => line.replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ""))
      .map((line) => stripMarkdownDecoration(line))
      .filter(Boolean)
  };
}

function parseParagraphBlock(block: string): AnswerBlock | null {
  const normalized = stripMarkdownDecoration(
    normalizeAnswerBlockLines(block)
      .map((line) => line.replace(/\|\s*/g, ", ").trim())
      .filter(Boolean)
      .join(" ")
  );

  if (!normalized) {
    return null;
  }

  return {
    kind: "paragraph",
    text: normalized
  };
}

function buildAnswerBlocks(text: string): AnswerBlock[] {
  return String(text || "")
    .replace(/```[\w-]*\n([\s\S]*?)```/g, "$1")
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => parseTableBlock(block) || parseListBlock(block) || parseParagraphBlock(block))
    .filter((block): block is AnswerBlock => Boolean(block));
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

function summarizeInput(input: Record<string, unknown>): string {
  if (typeof input.query === "string" && input.query.trim()) {
    return input.query.trim();
  }
  if (typeof input.transport === "string" && input.transport.trim()) {
    return `Transport: ${input.transport.trim()}`;
  }
  const keys = Object.keys(input);
  return keys.length > 0 ? `Input ready with ${keys.length} field${keys.length === 1 ? "" : "s"}.` : "Preparing request.";
}

function summarizeOutput(output: Record<string, unknown>): string {
  if (typeof output.title === "string" && output.title.trim()) {
    return output.title.trim();
  }
  if (typeof output.answer === "string" && output.answer.trim()) {
    return output.answer.trim();
  }
  if (typeof output.provider === "string" && output.provider.trim()) {
    return `Produced by ${toTitleCase(output.provider)}.`;
  }
  if (Array.isArray(output.citations) && output.citations.length > 0) {
    return `${output.citations.length} supporting reference${output.citations.length === 1 ? "" : "s"} attached.`;
  }
  if (typeof output.reconnectUrl === "string" && output.reconnectUrl.trim()) {
    return "Reconnect link ready.";
  }
  return "Output available.";
}

function buildToolRail(events: StreamEvent[]): ToolRailItem[] {
  const calls = new Map<string, ToolRailItem>();

  for (const event of events) {
    if (event.type === "tool-input-start") {
      const toolCallId = String(event.payload.toolCallId || "");
      calls.set(toolCallId, {
        id: toolCallId || `tool-${calls.size}`,
        label: toTitleCase(String(event.payload.toolName || "tool")),
        state: "pending",
        summary: "Preparing request."
      });
      continue;
    }

    if (event.type === "tool-input-available") {
      const toolCallId = String(event.payload.toolCallId || "");
      const current = calls.get(toolCallId);
      if (!current) {
        continue;
      }
      current.summary = summarizeInput((event.payload.input || {}) as Record<string, unknown>);
      continue;
    }

    if (event.type === "tool-output-available") {
      const toolCallId = String(event.payload.toolCallId || "");
      const current = calls.get(toolCallId);
      if (!current) {
        continue;
      }
      current.state = "complete";
      current.summary = summarizeOutput((event.payload.output || {}) as Record<string, unknown>);
      continue;
    }

    if (event.type === "tool-output-error") {
      const toolCallId = String(event.payload.toolCallId || "");
      const current = calls.get(toolCallId);
      if (!current) {
        continue;
      }
      current.state = "error";
      current.summary = String(event.payload.errorText || "Tool failed.");
    }
  }

  return [...calls.values()];
}

function buildTranscript(args: {
  derived: DerivedState;
  connectionError: string;
  isRunning: boolean;
  hideAnswer: boolean;
}): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const answerBlocks = buildAnswerBlocks(args.derived.text);

  if (args.derived.reasoning.length > 0) {
    entries.push({
      id: "reasoning",
      kind: "reasoning",
      title: "Live reasoning",
      items: args.derived.reasoning,
      live: args.isRunning
    });
  }

  if (!args.hideAnswer && answerBlocks.length > 0) {
    entries.push({
      id: "answer",
      kind: "answer",
      title: "Grounded answer",
      blocks: answerBlocks,
      citations: args.derived.citations
    });
  }

  if (args.derived.authRequired) {
    entries.push({
      id: "auth",
      kind: "status",
      tone: "warning",
      title: "Salesforce connection needed",
      body: "Reconnect Salesforce before the app can resume grounded search and assemble the workspace.",
      actionLabel: "Reconnect Salesforce"
    });
  }

  if (args.connectionError) {
    entries.push({
      id: "stream-error",
      kind: "status",
      tone: "error",
      title: "Stream connection interrupted",
      body: args.connectionError
    });
  }

  if (args.derived.toolError && !args.derived.authRequired) {
    entries.push({
      id: "tool-error",
      kind: "status",
      tone: "error",
      title: "Run needs attention",
      body: args.derived.toolError
    });
  }

  return entries;
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
  const [reasoningCollapsed, setReasoningCollapsed] = useState(false);
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
  const widgetStatusLabel = derived.widgetComplete ? "Final workspace" : derived.widgetCode ? "Preview" : "Preparing";
  const reasoningHighlights = derived.reasoning.slice(-6);
  const latestMilestone = reasoningHighlights.at(-1) || "";
  const productTitle = hostMode ? "Agentforce Search" : "Dynamic Workspace";
  const showOperatorPanels = !hostMode;
  const answerBlocks = useMemo(() => buildAnswerBlocks(derived.text), [derived.text]);
  const workspaceFollowUps = buildWorkspaceFollowUps(query, derived.citations.length > 0);
  const transcript = useMemo(
    () =>
      buildTranscript({
        derived,
        connectionError,
        isRunning,
        hideAnswer: true
      }),
    [connectionError, derived, isRunning]
  );
  const toolRail = useMemo(() => buildToolRail(events), [events]);

  useEffect(() => {
    if (isRunning && derived.reasoning.length > 0) {
      setReasoningCollapsed(false);
    }
  }, [derived.reasoning.length, isRunning]);

  useEffect(() => {
    document.documentElement.classList.toggle("host-mode", hostMode);
    document.body.classList.toggle("host-mode", hostMode);

    return () => {
      document.documentElement.classList.remove("host-mode");
      document.body.classList.remove("host-mode");
    };
  }, [hostMode]);

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
    <main className={`workspace-shell${hostMode ? " host-shell" : ""}`} style={shellVariables}>
      <header className="workspace-header shell-card">
        <div className="header-copy">
          <p className="kicker">{productTitle}</p>
        </div>
        <div className="header-status">
          <div className="status-stack">
            <span className={`status-chip ${derived.authRequired ? "warning" : derived.widgetComplete ? "complete" : ""}`}>
              {widgetStatusLabel}
            </span>
            <span className={`status-chip subtle ${connected ? "live" : reconnecting ? "warning" : ""}`}>{streamLabel}</span>
          </div>
        </div>
      </header>

      <section className="workspace-grid">
        {showOperatorPanels ? (
          <aside className="sidebar-column">
            <section className="shell-card sidebar-panel">
              <div className="panel-head">
                <div>
                  <p className="section-kicker">Session</p>
                  <h2>Run overview</h2>
                </div>
                <span className="status-pill">{hostMode ? "ChatGPT" : "Local"}</span>
              </div>
              <div className="sidebar-facts">
                <div className="fact-row">
                  <span>Run ID</span>
                  <strong>{runId ? `${runId.slice(0, 12)}...` : "Pending"}</strong>
                </div>
                <div className="fact-row">
                  <span>Connection</span>
                  <strong>{streamLabel}</strong>
                </div>
                <div className="fact-row">
                  <span>References</span>
                  <strong>{derived.citations.length}</strong>
                </div>
              </div>
            </section>
            <section className="shell-card sidebar-panel">
              <div className="panel-head">
                <div>
                  <p className="section-kicker">Tools</p>
                  <h2>Backend activity</h2>
                </div>
              </div>
              {toolRail.length > 0 ? (
                <div className="tool-rail">
                  {toolRail.map((item) => (
                    <article key={item.id} className={`tool-card ${item.state}`}>
                      <div className="tool-card-head">
                        <strong>{item.label}</strong>
                        <span className="tool-state">{toTitleCase(item.state)}</span>
                      </div>
                      <p>{item.summary}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">Tool lifecycle cards will appear as the run progresses.</p>
              )}
            </section>
          </aside>
        ) : null}

        <section className="thread-column">
          {showOperatorPanels ? (
            <section className="shell-card composer-shell">
              <div className="panel-head">
                <div>
                  <p className="section-kicker">Composer</p>
                  <h2>Ask the app</h2>
                </div>
                <span className="status-pill">{hostMode ? "Host bridge active" : "Browser mode"}</span>
              </div>
              <label className="composer-field">
                <span>Prompt</span>
                <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={3} />
              </label>
              <div className="composer-actions">
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
                <button type="button" className="secondary" onClick={() => void handleResumeRun()}>
                  Resume
                </button>
              </div>
            </section>
          ) : null}

          <section className="shell-card transcript-shell">
            <div className="panel-head">
              <div>
                <p className="section-kicker">Conversation</p>
                <h2>Thread</h2>
              </div>
              <span className={`status-pill subtle ${connected ? "live" : reconnecting ? "warning" : ""}`}>{streamLabel}</span>
            </div>

            {transcript.length > 0 ? (
              <div className="transcript-list">
                {latestMilestone ? (
                  <article className="message-card message-status info">
                    <div className="message-meta">
                      <span>Latest milestone</span>
                    </div>
                    <h3>Latest milestone</h3>
                    <p>{latestMilestone}</p>
                  </article>
                ) : null}
                {transcript.map((entry) => {
                  if (entry.kind === "reasoning") {
                    const reasoningSummary =
                      entry.items.at(-1) ||
                      `${entry.items.length} reasoning update${entry.items.length === 1 ? "" : "s"} captured.`;
                    return (
                      <article key={entry.id} className="message-card message-reasoning">
                        <div className="message-meta">
                          <span>{entry.live ? "Streaming reasoning" : "Reasoning complete"}</span>
                        </div>
                        <div className="message-heading">
                          <h3>{entry.title}</h3>
                          <button
                            type="button"
                            className="collapse-toggle"
                            aria-expanded={!reasoningCollapsed}
                            aria-controls={`${entry.id}-body`}
                            onClick={() => setReasoningCollapsed((value) => !value)}
                          >
                            {reasoningCollapsed ? "Expand" : "Collapse"}
                          </button>
                        </div>
                        <div id={`${entry.id}-body`} className="reasoning-body">
                          {reasoningCollapsed ? (
                            <p className="collapsed-note">
                              {reasoningSummary}
                              {!entry.live ? ` ${entry.items.length} step${entry.items.length === 1 ? "" : "s"} captured.` : ""}
                            </p>
                          ) : (
                            <ul className="reasoning-list">
                              {entry.items.map((item, index) => (
                                <li key={`${entry.id}-${index}`}>{item}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </article>
                    );
                  }

                  if (entry.kind === "answer") {
                    return (
                      <article key={entry.id} className="message-card message-answer">
                        <div className="message-meta">
                          <span>{entry.citations.length > 0 ? `${entry.citations.length} sources` : "Grounded response"}</span>
                        </div>
                        <h3>{entry.title}</h3>
                        <AnswerBlocksView blocks={entry.blocks} idPrefix={entry.id} />
                        {entry.citations.length > 0 ? (
                          <div className="citation-row">
                            {entry.citations.map((citation) => (
                              <a
                                key={`${citation.label}:${citation.url}:${entry.id}`}
                                className="citation-link"
                                href={citation.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => handleExternalLinkClick(event, citation.url)}
                              >
                                {citation.label}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    );
                  }

                  return (
                    <article key={entry.id} className={`message-card message-status ${entry.tone}`}>
                      <div className="message-meta">
                        <span className="message-role">System</span>
                        <span>{toTitleCase(entry.tone)}</span>
                      </div>
                      <h3>{entry.title}</h3>
                      <p>{entry.body}</p>
                      {entry.actionLabel === "Reconnect Salesforce" ? (
                        <div className="message-actions">
                          {derived.reconnectUrl ? (
                            <a
                              className="link-button"
                              href={derived.reconnectUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => handleExternalLinkClick(event, derived.reconnectUrl)}
                            >
                              {entry.actionLabel}
                            </a>
                          ) : (
                            <button type="button" className="secondary" onClick={() => void handleReconnectSalesforce()}>
                              {entry.actionLabel}
                            </button>
                          )}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : hasStarted ? (
              <div className="transcript-empty">
                <div className="thread-placeholder">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <p>The thread is waiting for the first streamed event from the backend.</p>
              </div>
            ) : (
              <div className="transcript-empty">
                <p>Start a run to see the grounded search, reasoning, and answer appear as a live thread.</p>
              </div>
            )}
          </section>
        </section>

        <aside className="artifact-column">
          <section className="shell-card artifact-panel">
            <div className="panel-head">
              <div>
                <h2>{derived.widgetTitle}</h2>
              </div>
              <span className={`status-chip ${derived.widgetComplete ? "complete" : ""}`}>{widgetStatusLabel}</span>
            </div>
            <div className="artifact-stage">
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
              ) : answerBlocks.length > 0 ? (
                <article className="message-card message-answer artifact-answer-shell">
                  <div className="message-meta">
                    <span>{derived.citations.length > 0 ? `${derived.citations.length} sources` : "Grounded response"}</span>
                  </div>
                  <h3>Grounded answer</h3>
                  <AnswerBlocksView blocks={answerBlocks} idPrefix="artifact-answer" className="artifact-answer-copy" />
                </article>
              ) : isRunning ? (
                <div className="artifact-loading" aria-hidden="true">
                  <div className="artifact-loading-hero"></div>
                  <div className="artifact-loading-grid">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <div className="artifact-loading-panel"></div>
                </div>
              ) : (
                <div className="artifact-empty">
                  <p>Start a run to generate the interactive workspace.</p>
                </div>
              )}
            </div>
          </section>

          <section className="shell-card followup-panel">
            <div className="panel-head">
              <div>
                <p className="section-kicker">Follow-ups</p>
                <h2>Continue the thread</h2>
              </div>
            </div>
            <div className="followup-list">
              {workspaceFollowUps.map((prompt) => (
                <button key={prompt} type="button" className="followup-chip" onClick={() => void handleFollowUp(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
            {derived.citations.length > 0 ? (
              <div className="reference-panel">
                <span className="section-kicker">References</span>
                <div className="citation-row">
                  {derived.citations.map((citation) => (
                    <a
                      key={`${citation.label}:${citation.url}:artifact`}
                      className="citation-link"
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => handleExternalLinkClick(event, citation.url)}
                    >
                      {citation.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </aside>
      </section>

      <details className="shell-card diagnostics">
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
