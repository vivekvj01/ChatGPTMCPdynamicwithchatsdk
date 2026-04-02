import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { SharedCitation, SharedSalesforceSession } from "../auth/adapter.js";

export type DirectAgentforceStreamEvent =
  | { type: "progress"; message: string }
  | { type: "text-chunk"; text: string }
  | { type: "inform"; answer: string; citations: SharedCitation[] }
  | { type: "validation-failure"; message: string }
  | { type: "end" };

export type DirectAgentforceResult = {
  mode: "direct-agentforce" | "demo";
  text: string;
  summary: string;
  citations: SharedCitation[];
  rawEvents: unknown[];
};

type AgentSession = {
  baseUrl: string;
  token: string;
  sessionId: string;
  instanceUrl: string;
  extraHeaders: Record<string, string>;
  messagesStreamUrl?: string;
};

function summarizeText(text: string, maxLength = 220): string {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) {
    return "";
  }
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 3)}...`;
}

function summarizeBody(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function getInstanceUrl(session: SharedSalesforceSession): string {
  return String(session.instanceUrl || "").replace(/\/+$/, "");
}

function getApiBaseUrl(config: AppConfig, session: SharedSalesforceSession): string {
  const configured = String(config.salesforceAgentApiBaseUrl || "").trim().replace(/\/+$/, "");
  if (configured) {
    return configured.endsWith("/einstein/ai-agent/v1")
      ? configured
      : `${configured}/einstein/ai-agent/v1`;
  }

  const instanceUrl = getInstanceUrl(session);
  if (!instanceUrl) {
    throw new Error("The Salesforce session is missing instanceUrl.");
  }

  return `${instanceUrl}/einstein/ai-agent/v1`;
}

function normalizeSalesforceLink(rawLink: string, session: SharedSalesforceSession): string {
  const link = String(rawLink || "").trim();
  if (!link) {
    return link;
  }
  if (/^https?:\/\//i.test(link)) {
    return link;
  }
  if (!link.startsWith("/")) {
    return link;
  }

  const instanceUrl = getInstanceUrl(session);
  return instanceUrl ? `${instanceUrl}${link}` : link;
}

function normalizeSalesforceLinksInText(text: string, session: SharedSalesforceSession): string {
  if (!String(text || "").trim()) {
    return "";
  }

  return String(text)
    .replace(/\]\((\/[^)\s]+)\)/g, (_match, relativeLink: string) => {
      return `](${normalizeSalesforceLink(relativeLink, session)})`;
    })
    .replace(/href=(['"])(\/[^"' >]+)\1/g, (_match, quote: string, relativeLink: string) => {
      return `href=${quote}${normalizeSalesforceLink(relativeLink, session)}${quote}`;
    })
    .replace(/<(\/[^ >]+\/[^ >]+)>/g, (_match, relativeLink: string) => {
      return `<${normalizeSalesforceLink(relativeLink, session)}>`;
    });
}

function buildAgentHeaders(
  config: AppConfig,
  session: SharedSalesforceSession
): Record<string, string> {
  const salesforceUserId = String(session.salesforceUserId || session.userId || "").trim();
  if (!session.accessToken || !salesforceUserId) {
    throw new Error("The Salesforce session is missing accessToken or userId.");
  }

  return {
    Authorization: `${session.tokenType || "Bearer"} ${session.accessToken}`,
    "Content-Type": "application/json",
    "x-sfdc-tenant-id": config.salesforceTenantId,
    "x-sfdc-user-id": salesforceUserId,
    "x-runtime-user-id": salesforceUserId,
    "x-salesforce-region": config.salesforceRegion
  };
}

function parseJsonResponse<T>(
  baseUrl: string,
  label: string,
  response: { status: number; headers: Headers; text: string }
): T {
  const contentType = response.headers.get("content-type") ?? "unknown";
  try {
    return JSON.parse(response.text) as T;
  } catch {
    throw new Error(
      `${label} on ${baseUrl} returned ${response.status} ${contentType}: ${summarizeBody(response.text)}`
    );
  }
}

function parseSseDataBlock(block: string): string | null {
  const dataLines: string[] = [];
  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine.startsWith("data:")) {
      continue;
    }
    dataLines.push(rawLine.slice("data:".length).trimStart());
  }
  return dataLines.length > 0 ? dataLines.join("\n") : null;
}

function uniqueCitations(citations: SharedCitation[]): SharedCitation[] {
  const seen = new Set<string>();
  const results: SharedCitation[] = [];
  for (const citation of citations) {
    const key = `${citation.label}|${citation.url}`.toLowerCase();
    if (!citation.url || seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(citation);
  }
  return results.slice(0, 8);
}

function extractTextCitations(text: string, session: SharedSalesforceSession): SharedCitation[] {
  const citations: SharedCitation[] = [];
  const seen = new Set<string>();
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(text)) !== null && citations.length < 8) {
    const label = String(match[1] || "").trim();
    const url = normalizeSalesforceLink(String(match[2] || "").trim(), session);
    const key = `${label}|${url}`.toLowerCase();
    if (!url || seen.has(key)) {
      continue;
    }
    seen.add(key);
    citations.push({
      label: label || `Reference ${citations.length + 1}`,
      url
    });
  }

  return citations;
}

function extractCitations(value: unknown, session: SharedSalesforceSession): SharedCitation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const citations: SharedCitation[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const metadata =
      "metadata" in entry && entry.metadata && typeof entry.metadata === "object"
        ? (entry.metadata as Record<string, unknown>)
        : (entry as Record<string, unknown>);
    const rawUrl =
      typeof metadata.link === "string"
        ? metadata.link
        : typeof metadata.url === "string"
          ? metadata.url
          : typeof metadata.href === "string"
            ? metadata.href
            : "";
    const url = normalizeSalesforceLink(rawUrl, session);
    if (!url) {
      continue;
    }
    const label = String(metadata.label || metadata.title || metadata.name || "").trim();
    citations.push({
      label: label || `Reference ${citations.length + 1}`,
      url
    });
  }

  return uniqueCitations(citations);
}

async function createAgentSession(
  config: AppConfig,
  session: SharedSalesforceSession,
  signal?: AbortSignal
): Promise<AgentSession> {
  const baseUrl = getApiBaseUrl(config, session);
  const instanceUrl = getInstanceUrl(session);
  const extraHeaders = buildAgentHeaders(config, session);
  const response = await fetch(`${baseUrl}/agents/${config.salesforceAgentId}/sessions`, {
    method: "POST",
    headers: extraHeaders,
    body: JSON.stringify({
      bypassUser: false,
      externalSessionKey: randomUUID(),
      instanceConfig: { endpoint: instanceUrl },
      streamingCapabilities: { chunkTypes: ["Text"] }
    }),
    signal
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(
      `Agent session creation failed on ${baseUrl} (${response.status}): ${summarizeBody(text)}`
    );
  }

  const data = parseJsonResponse<{
    sessionId?: string;
    _links?: { messagesStream?: { href?: string } };
  }>(baseUrl, "Agent session creation", {
    status: response.status,
    headers: response.headers,
    text
  });

  if (!data.sessionId) {
    throw new Error(`Agent session creation failed on ${baseUrl}: missing sessionId`);
  }

  return {
    baseUrl,
    token: session.accessToken,
    sessionId: data.sessionId,
    instanceUrl,
    extraHeaders,
    messagesStreamUrl:
      typeof data._links?.messagesStream?.href === "string" ? data._links.messagesStream.href : undefined
  };
}

async function deleteAgentSession(session: AgentSession): Promise<void> {
  await fetch(`${session.baseUrl}/sessions/${session.sessionId}`, {
    method: "DELETE",
    headers: {
      Authorization: `${session.extraHeaders.Authorization}`,
      "x-sfdc-tenant-id": session.extraHeaders["x-sfdc-tenant-id"],
      "x-sfdc-user-id": session.extraHeaders["x-sfdc-user-id"],
      "x-runtime-user-id": session.extraHeaders["x-runtime-user-id"],
      "x-salesforce-region": session.extraHeaders["x-salesforce-region"]
    }
  }).catch(() => undefined);
}

async function readAgentMessageStream(args: {
  session: AgentSession;
  query: string;
  onEvent: (event: DirectAgentforceStreamEvent) => void;
  signal?: AbortSignal;
  rawEvents: unknown[];
}): Promise<void> {
  const streamUrl =
    args.session.messagesStreamUrl ??
    `${args.session.baseUrl}/sessions/${args.session.sessionId}/messages/stream`;

  const response = await fetch(streamUrl, {
    method: "POST",
    headers: {
      ...args.session.extraHeaders,
      Accept: "text/event-stream"
    },
    body: JSON.stringify({
      message: { sequenceId: 1, type: "Text", text: args.query }
    }),
    cache: "no-store",
    signal: args.signal
  });

  if (!response.ok || !response.body) {
    const failText = await response.text().catch(() => "");
    throw new Error(
      `Agent message stream failed on ${args.session.baseUrl} (${response.status}): ${summarizeBody(failText)}`
    );
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let sawEnd = false;

  const processBlock = (block: string) => {
    const data = parseSseDataBlock(block);
    if (!data) {
      return;
    }

    let envelope: {
      message?: {
        type?: unknown;
        message?: unknown;
        citedReferences?: unknown;
      };
    };

    try {
      envelope = JSON.parse(data) as typeof envelope;
    } catch {
      return;
    }

    args.rawEvents.push(envelope);
    const message = envelope.message;
    const messageType = typeof message?.type === "string" ? message.type : "";
    const messageText = normalizeSalesforceLinksInText(
      typeof message?.message === "string" ? message.message : "",
      {
        accessToken: args.session.token,
        tokenType: "Bearer",
        instanceUrl: args.session.instanceUrl,
        userId: args.session.extraHeaders["x-sfdc-user-id"] || ""
      }
    );

    switch (messageType) {
      case "ProgressIndicator":
        if (messageText) {
          args.onEvent({ type: "progress", message: messageText });
        }
        break;
      case "TextChunk":
        if (messageText) {
          args.onEvent({ type: "text-chunk", text: messageText });
        }
        break;
      case "Inform":
        args.onEvent({
          type: "inform",
          answer: messageText,
          citations: extractCitations(
            message?.citedReferences,
            {
              accessToken: args.session.token,
              tokenType: "Bearer",
              instanceUrl: args.session.instanceUrl,
              userId: args.session.extraHeaders["x-sfdc-user-id"] || ""
            }
          )
        });
        break;
      case "ValidationFailureChunk":
        if (messageText) {
          args.onEvent({ type: "validation-failure", message: messageText });
        }
        break;
      case "EndOfTurn":
        sawEnd = true;
        args.onEvent({ type: "end" });
        break;
      default:
        break;
    }
  };

  const reader = response.body.getReader();
  while (!sawEnd) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.search(/\r?\n\r?\n/);
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      const separatorLength = buffer[boundary] === "\r" ? 4 : 2;
      buffer = buffer.slice(boundary + separatorLength);
      if (block.trim()) {
        processBlock(block.trim());
      }
      if (sawEnd) {
        break;
      }
      boundary = buffer.search(/\r?\n\r?\n/);
    }
  }

  if (!sawEnd && buffer.trim()) {
    processBlock(buffer.trim());
  }
}

export class DirectAgentforceService {
  constructor(private readonly config: AppConfig) {}

  hasDirectConfig(): boolean {
    return Boolean(
      String(this.config.salesforceAgentId || "").trim() &&
        String(this.config.salesforceTenantId || "").trim() &&
        String(this.config.salesforceRegion || "").trim()
    );
  }

  async runSearch(args: {
    session?: SharedSalesforceSession | null;
    query: string;
    signal?: AbortSignal;
    onEvent?: (event: DirectAgentforceStreamEvent) => void;
  }): Promise<DirectAgentforceResult> {
    const trimmedQuery = String(args.query || "").trim();
    if (!trimmedQuery) {
      throw new Error("query is required");
    }

    if (!this.hasDirectConfig()) {
      const text =
        "Demo mode is active because the direct Agentforce configuration is incomplete for this environment.";
      return {
        mode: "demo",
        text,
        summary: summarizeText(text),
        citations: [],
        rawEvents: [{ demo: true }]
      };
    }

    if (!args.session) {
      throw new Error("A live Salesforce session is required for direct Agentforce search.");
    }

    const salesforceSession = args.session;
    const rawEvents: unknown[] = [];
    let streamedText = "";
    let informAnswer = "";
    let validationMessage = "";
    let citations: SharedCitation[] = [];
    const session = await createAgentSession(this.config, salesforceSession, args.signal);

    try {
      await readAgentMessageStream({
        session,
        query: trimmedQuery,
        signal: args.signal,
        rawEvents,
        onEvent: (event) => {
          args.onEvent?.(event);
          switch (event.type) {
            case "text-chunk":
              if (!validationMessage) {
                streamedText += event.text;
              }
              break;
            case "inform":
              if (!validationMessage) {
                informAnswer = event.answer;
                citations = uniqueCitations([...citations, ...event.citations]);
              }
              break;
            case "validation-failure":
              validationMessage = event.message;
              streamedText = event.message;
              informAnswer = event.message;
              citations = [];
              break;
            default:
              break;
          }
        }
      });
    } finally {
      await deleteAgentSession(session);
    }

    const finalText = String(informAnswer || streamedText || validationMessage).trim();
    const normalizedText = normalizeSalesforceLinksInText(finalText, salesforceSession);
    const normalizedCitations = uniqueCitations([
      ...citations.map((citation) => ({
        ...citation,
        url: normalizeSalesforceLink(citation.url, salesforceSession)
      })),
      ...extractTextCitations(normalizedText, salesforceSession)
    ]);

    if (!normalizedText) {
      throw new Error("Search Agent returned no readable answer.");
    }

    return {
      mode: "direct-agentforce",
      text: normalizedText,
      summary: summarizeText(normalizedText),
      citations: normalizedCitations,
      rawEvents
    };
  }
}
