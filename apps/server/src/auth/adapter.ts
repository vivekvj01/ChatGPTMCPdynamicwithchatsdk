import type { AppConfig } from "../config.js";

export type SharedCitation = {
  label: string;
  url: string;
};

export type SharedSalesforceSession = {
  accessToken: string;
  tokenType: string;
  instanceUrl: string;
  userId: string;
  salesforceUserId?: string | null;
};

export type SharedSessionResult = {
  connected: boolean;
  reconnectUrl: string | null;
  authServiceUserId: string;
  mode: "shared-auth-service" | "demo";
  session: SharedSalesforceSession | null;
};

function stripWrappingQuotes(value: string): string {
  return String(value || "").trim().replace(/^['"]+|['"]+$/g, "");
}

function toAuthServiceUserId(chatgptUsername: string): string {
  const normalized = String(chatgptUsername || "").trim();
  return `chatgpt:${normalized || "anonymous"}`;
}


function extractSession(value: unknown): SharedSalesforceSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const sessionRecord =
    record.session && typeof record.session === "object"
      ? (record.session as Record<string, unknown>)
      : record;

  const accessToken = String(sessionRecord.accessToken || sessionRecord.token || "").trim();
  const instanceUrl = String(sessionRecord.instanceUrl || sessionRecord.apiUrl || "").trim();
  const userId = String(
    sessionRecord.userId || sessionRecord.salesforceUserId || record.salesforceUserId || ""
  ).trim();

  if (!accessToken || !instanceUrl || !userId) {
    return null;
  }

  return {
    accessToken,
    tokenType: String(sessionRecord.tokenType || "Bearer").trim() || "Bearer",
    instanceUrl,
    userId,
    salesforceUserId: String(sessionRecord.salesforceUserId || "").trim() || null
  };
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
        mode: "demo",
        session: null
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
        mode: "shared-auth-service",
        session: extractSession(data)
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
      mode: "shared-auth-service",
      session: extractSession(data)
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
}
