import type { AppConfig } from "../config.js";

export type SharedCitation = {
  label: string;
  url: string;
};

export type SharedSessionResult = {
  connected: boolean;
  reconnectUrl: string | null;
  authServiceUserId: string;
  mode: "shared-auth-service" | "demo";
};

export type SharedAgentQueryResult = {
  unsupported: boolean;
  mode: "shared-auth-service" | "demo";
  authServiceUserId: string;
  conversationKey: string;
  text: string;
  summary: string;
  citations: SharedCitation[];
  raw: unknown;
};

function stripWrappingQuotes(value: string): string {
  return String(value || "").trim().replace(/^['"]+|['"]+$/g, "");
}

function toAuthServiceUserId(chatgptUsername: string): string {
  const normalized = String(chatgptUsername || "").trim();
  return `chatgpt:${normalized || "anonymous"}`;
}

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

function extractTextFromValue(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTextFromValue(item));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const directFields = [
    "text",
    "answer",
    "message",
    "content",
    "response",
    "output",
    "summary"
  ];
  const nestedFields = [
    "data",
    "result",
    "response",
    "message",
    "messages",
    "choices",
    "records"
  ];

  const chunks: string[] = [];
  for (const key of directFields) {
    if (key in record) {
      chunks.push(...extractTextFromValue(record[key]));
    }
  }
  for (const key of nestedFields) {
    if (key in record) {
      chunks.push(...extractTextFromValue(record[key]));
    }
  }

  return chunks;
}

function extractCitationsFromText(text: string): SharedCitation[] {
  const citations: SharedCitation[] = [];
  const seen = new Set<string>();
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(text)) !== null && citations.length < 8) {
    const label = String(match[1] || "").trim();
    const url = String(match[2] || "").trim();
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

function extractCitationsFromValue(value: unknown): SharedCitation[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractCitationsFromValue(item));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const citations = Array.isArray(record.citations) ? record.citations : [];
  const results: SharedCitation[] = [];

  for (const item of citations) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const citation = item as Record<string, unknown>;
    const label = String(citation.label || citation.title || citation.name || "").trim();
    const url = String(citation.url || citation.href || "").trim();
    if (!url) {
      continue;
    }
    results.push({
      label: label || `Reference ${results.length + 1}`,
      url
    });
  }

  return results;
}

function uniqueCitations(citations: SharedCitation[]): SharedCitation[] {
  const seen = new Set<string>();
  const deduped: SharedCitation[] = [];

  for (const citation of citations) {
    const key = `${citation.label}|${citation.url}`.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(citation);
  }

  return deduped.slice(0, 8);
}

export class AuthAdapter {
  constructor(private readonly config: AppConfig) {}

  private hasSharedAuthConfig(): boolean {
    return Boolean(
      stripWrappingQuotes(this.config.salesforceAuthServiceUrl) &&
        stripWrappingQuotes(this.config.salesforceAuthServiceSecret)
    );
  }

  private getHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${stripWrappingQuotes(this.config.salesforceAuthServiceSecret)}`,
      "Content-Type": "application/json"
    };
  }

  private resolveLoginUrl(loginUrl?: string): string | undefined {
    return (
      stripWrappingQuotes(loginUrl || "") ||
      stripWrappingQuotes(this.config.salesforceLoginUrl) ||
      undefined
    );
  }

  async getSharedSession(
    chatgptUsername: string,
    options: { loginUrl?: string } = {}
  ): Promise<SharedSessionResult> {
    const authServiceUserId = toAuthServiceUserId(chatgptUsername);

    if (!this.hasSharedAuthConfig()) {
      return {
        connected: true,
        reconnectUrl: null,
        authServiceUserId,
        mode: "demo"
      };
    }

    const loginUrl = this.resolveLoginUrl(options.loginUrl);
    const sessionUrl = new URL(
      `/api/teams/session/${encodeURIComponent(authServiceUserId)}`,
      this.config.salesforceAuthServiceUrl
    );

    if (loginUrl) {
      sessionUrl.searchParams.set("loginUrl", loginUrl);
    }

    const response = await fetch(sessionUrl, {
      method: "GET",
      headers: this.getHeaders()
    });

    if (response.status === 404) {
      const data = (await response.json().catch(() => ({}))) as {
        connected?: boolean;
        connectUrl?: string | null;
      };

      return {
        connected: Boolean(data.connected),
        reconnectUrl: data.connectUrl || null,
        authServiceUserId,
        mode: "shared-auth-service"
      };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Auth service session lookup failed (${response.status})${text ? `: ${text}` : ""}`);
    }

    const data = (await response.json().catch(() => ({}))) as {
      connected?: boolean;
      connectUrl?: string | null;
    };

    return {
      connected: Boolean(data.connected),
      reconnectUrl: data.connectUrl || null,
      authServiceUserId,
      mode: "shared-auth-service"
    };
  }

  async getConnectUrl(
    chatgptUsername: string,
    options: { loginUrl?: string } = {}
  ): Promise<{ reconnectUrl: string | null; authServiceUserId: string }> {
    const authServiceUserId = toAuthServiceUserId(chatgptUsername);

    if (!this.hasSharedAuthConfig()) {
      return {
        reconnectUrl: `${this.config.appBaseUrl}/demo/connect`,
        authServiceUserId
      };
    }

    const response = await fetch(new URL("/api/teams/connect", this.config.salesforceAuthServiceUrl), {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        teamsUserId: authServiceUserId,
        loginUrl: this.resolveLoginUrl(options.loginUrl)
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Auth service connect lookup failed (${response.status})${text ? `: ${text}` : ""}`);
    }

    const data = (await response.json().catch(() => ({}))) as { connectUrl?: string | null };
    return {
      reconnectUrl: data.connectUrl || null,
      authServiceUserId
    };
  }

  async runSharedAgentQuery(
    chatgptUsername: string,
    conversationKey: string,
    message: string,
    options: { loginUrl?: string } = {}
  ): Promise<SharedAgentQueryResult> {
    const authServiceUserId = toAuthServiceUserId(chatgptUsername);
    const normalizedConversationKey = String(conversationKey || "").trim() || "default";
    const trimmedMessage = String(message || "").trim();

    if (!trimmedMessage) {
      throw new Error("message is required");
    }

    if (!this.hasSharedAuthConfig()) {
      const text = [
        `Demo mode is active because the shared auth service is not configured.`,
        `The app would normally run a grounded query for: ${trimmedMessage}`,
        "This placeholder result keeps the streaming and widget pipeline working while backend credentials are being wired."
      ].join(" ");

      return {
        unsupported: false,
        mode: "demo",
        authServiceUserId,
        conversationKey: normalizedConversationKey,
        text,
        summary: summarizeText(text),
        citations: [],
        raw: { demo: true }
      };
    }

    const response = await fetch(new URL("/api/teams/agent/query", this.config.salesforceAuthServiceUrl), {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        teamsUserId: authServiceUserId,
        conversationKey: normalizedConversationKey,
        message: trimmedMessage,
        loginUrl: this.resolveLoginUrl(options.loginUrl)
      })
    });

    const data = (await response.json().catch(() => ({}))) as unknown;

    if (response.status === 404 || response.status === 405 || response.status === 501) {
      const text = `The shared auth service does not currently support /api/teams/agent/query for this environment.`;
      return {
        unsupported: true,
        mode: "shared-auth-service",
        authServiceUserId,
        conversationKey: normalizedConversationKey,
        text,
        summary: summarizeText(text),
        citations: [],
        raw: data
      };
    }

    if (!response.ok) {
      const text = typeof data === "string" ? data : JSON.stringify(data);
      throw new Error(`Auth service agent query failed (${response.status})${text ? `: ${text}` : ""}`);
    }

    const extractedText = extractTextFromValue(data).join("\n\n").trim();
    const text =
      extractedText ||
      `The shared auth service returned a response for "${trimmedMessage}", but no readable text fields were found.`;
    const citations = uniqueCitations([
      ...extractCitationsFromValue(data),
      ...extractCitationsFromText(text)
    ]);

    return {
      unsupported: false,
      mode: "shared-auth-service",
      authServiceUserId,
      conversationKey: normalizedConversationKey,
      text,
      summary: summarizeText(text),
      citations,
      raw: data
    };
  }
}
