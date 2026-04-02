import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Express } from "express";
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

type ClientMetadata = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
};

class InMemoryClientsStore {
  private readonly clients = new Map<string, ClientMetadata>();

  async getClient(clientId: string): Promise<ClientMetadata | undefined> {
    return this.clients.get(clientId);
  }

  async ensurePublicClient(args: {
    clientId: string;
    redirectUri: string;
    clientName?: string;
  }): Promise<ClientMetadata | null> {
    const normalizedClientId = String(args.clientId || "").trim();
    const normalizedRedirectUri = String(args.redirectUri || "").trim();
    if (!normalizedClientId || !normalizedRedirectUri) {
      return null;
    }

    const existing = this.clients.get(normalizedClientId);
    if (existing) {
      if (!existing.redirect_uris.includes(normalizedRedirectUri)) {
        existing.redirect_uris = [...existing.redirect_uris, normalizedRedirectUri];
        this.clients.set(normalizedClientId, existing);
      }
      return existing;
    }

    const clientMetadata: ClientMetadata = {
      client_id: normalizedClientId,
      client_name: args.clientName || "ChatGPT",
      redirect_uris: [normalizedRedirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    };

    this.clients.set(normalizedClientId, clientMetadata);
    return clientMetadata;
  }

  async registerClient(clientMetadata: ClientMetadata): Promise<ClientMetadata> {
    this.clients.set(clientMetadata.client_id, clientMetadata);
    return clientMetadata;
  }
}

function toBase64Url(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4 || 4)) % 4;
  return Buffer.from(`${normalized}${"=".repeat(padding)}`, "base64");
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getCookieValue(req: { headers?: { cookie?: string } }, name: string): string {
  const cookieHeader = String(req?.headers?.cookie || "");
  if (!cookieHeader) {
    return "";
  }

  const target = `${name}=`;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(target)) {
      continue;
    }

    try {
      return decodeURIComponent(trimmed.slice(target.length));
    } catch {
      return trimmed.slice(target.length);
    }
  }

  return "";
}

function getPreferredChatgptUsername(req: {
  method?: string;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: { cookie?: string };
}): string {
  const requestSource = req?.method === "POST" ? req.body : req?.query;
  const candidates = [
    requestSource?.chatgptUsername,
    requestSource?.login_hint,
    requestSource?.username,
    getCookieValue(req, "cgpt_username_hint")
  ];

  for (const value of candidates) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function renderAuthorizePage(
  req: {
    method?: string;
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
    headers?: { cookie?: string };
  },
  res: {
    status: (code: number) => { type: (type: string) => { send: (html: string) => void } };
  },
  client: ClientMetadata,
  params: {
    redirectUri: string;
    state?: string;
    resource?: URL | null;
    scopes?: string[];
    codeChallenge?: string;
  },
  errorMessage = ""
): void {
  const fields = [
    ["client_id", client.client_id],
    ["redirect_uri", params.redirectUri],
    ["response_type", "code"],
    ["code_challenge", params.codeChallenge || ""],
    ["code_challenge_method", "S256"],
    ["state", params.state || ""],
    ["resource", params.resource?.href || ""],
    ["scope", params.scopes?.join(" ") || "mcp:tools"]
  ]
    .filter(([, value]) => value)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(String(value))}">`
    )
    .join("\n");

  const chatgptUsername = getPreferredChatgptUsername(req);
  const readOnly = chatgptUsername ? " readonly aria-readonly=\"true\"" : "";
  const value = chatgptUsername ? ` value="${escapeHtml(chatgptUsername)}"` : "";
  const errorBlock = errorMessage ? `<p style="color:#b91c1c;font-weight:600;">${escapeHtml(errorMessage)}</p>` : "";

  res
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Authorize ChatGPT Access</title>
    <style>
      body { font-family: "Geist", Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif; font-feature-settings: "cv03", "cv04", "cv11"; margin: 0; background: #f8fafc; color: #0f172a; padding: 24px; }
      .shell { max-width: 760px; margin: 0 auto; display: grid; gap: 18px; }
      .card { background: white; border: 1px solid rgba(15,23,42,0.08); border-radius: 24px; padding: 24px; }
      h1 { margin: 0 0 12px; font-size: 32px; }
      p { line-height: 1.6; color: #475569; }
      input { width: 100%; padding: 14px 16px; border-radius: 16px; border: 1px solid rgba(15,23,42,0.14); font: inherit; }
      .actions { display: flex; gap: 12px; margin-top: 20px; }
      button { border: 0; border-radius: 999px; padding: 12px 18px; font: inherit; font-weight: 700; cursor: pointer; }
      .primary { background: #2563eb; color: white; }
      .secondary { background: #e2e8f0; color: #0f172a; }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="card">
        <h1>Authorize ${escapeHtml(client.client_name || "ChatGPT")}</h1>
        <p>Authorize this ChatGPT app and bind it to your ChatGPT username for Salesforce auth lookup.</p>
        ${errorBlock}
        <form method="post">
          ${fields}
          <label for="chatgptUsername">ChatGPT Username</label>
          <input id="chatgptUsername" name="chatgptUsername" type="text" autocomplete="username" required${value}${readOnly}>
          <div class="actions">
            <button class="primary" type="submit" name="decision" value="approve">Authorize</button>
            <button class="secondary" type="submit" name="decision" value="deny">Deny</button>
          </div>
        </form>
      </section>
    </main>
  </body>
</html>`);
}

type OAuthArtifact = {
  kind: "code" | "access" | "refresh";
  exp: number;
  clientId: string;
  username: string;
  scopes: string[];
  resource?: string | null;
  redirectUri?: string | null;
  codeChallenge?: string;
};

class ChatGptOAuthProvider {
  readonly clientsStore = new InMemoryClientsStore();
  private readonly signingSecret: string;

  constructor({ signingSecret }: { signingSecret: string }) {
    this.signingSecret = String(signingSecret || "").trim();
    if (!this.signingSecret) {
      throw new Error("A signingSecret is required for OAuth token signing.");
    }
  }

  private signArtifact(payload: OAuthArtifact): string {
    const payloadString = JSON.stringify(payload);
    const encodedPayload = toBase64Url(payloadString);
    const signature = createHmac("sha256", this.signingSecret)
      .update(encodedPayload)
      .digest("base64url");
    return `cgpt.${encodedPayload}.${signature}`;
  }

  private verifyArtifact(token: string, expectedKind: OAuthArtifact["kind"]): OAuthArtifact {
    const [prefix, encodedPayload, signature] = String(token || "").split(".");
    if (prefix !== "cgpt" || !encodedPayload || !signature) {
      throw new InvalidGrantError(`Invalid ${expectedKind} token`);
    }

    const expectedSignature = createHmac("sha256", this.signingSecret)
      .update(encodedPayload)
      .digest("base64url");
    const providedSignatureBuffer = Buffer.from(signature);
    const expectedSignatureBuffer = Buffer.from(expectedSignature);
    if (
      providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
      !timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)
    ) {
      throw new InvalidGrantError(`Invalid ${expectedKind} token`);
    }

    let payload: OAuthArtifact;
    try {
      payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as OAuthArtifact;
    } catch {
      throw new InvalidGrantError(`Invalid ${expectedKind} token`);
    }

    if (payload.kind !== expectedKind || Number(payload.exp || 0) <= Date.now()) {
      throw new InvalidGrantError(`Invalid ${expectedKind} token`);
    }

    return payload;
  }

  private createArtifact(kind: OAuthArtifact["kind"], payload: Omit<OAuthArtifact, "kind" | "exp">, ttlMs: number): string {
    return this.signArtifact({
      ...payload,
      kind,
      exp: Date.now() + ttlMs
    });
  }

  private peekArtifact(token: string, expectedKind: OAuthArtifact["kind"]): OAuthArtifact | null {
    try {
      return this.verifyArtifact(token, expectedKind);
    } catch {
      return null;
    }
  }

  private getClientMetadataFromRequest(req: {
    method?: string;
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
  }): { clientId: string; redirectUri: string } | null {
    const requestSource = req.method === "POST" ? req.body : req.query;
    const clientId = String(requestSource?.client_id || "").trim();
    if (!clientId) {
      return null;
    }

    let redirectUri = String(requestSource?.redirect_uri || "").trim();
    if (!redirectUri) {
      const authorizationCode = String(requestSource?.code || "").trim();
      const refreshToken = String(requestSource?.refresh_token || "").trim();
      redirectUri =
        String(this.peekArtifact(authorizationCode, "code")?.redirectUri || "").trim() ||
        String(this.peekArtifact(refreshToken, "refresh")?.redirectUri || "").trim();
    }

    return {
      clientId,
      redirectUri
    };
  }

  async ensureClientForRequest(req: {
    method?: string;
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
  }): Promise<ClientMetadata | null> {
    const clientMetadata = this.getClientMetadataFromRequest(req);
    if (!clientMetadata?.clientId) {
      return null;
    }

    return this.clientsStore.ensurePublicClient({
      clientId: clientMetadata.clientId,
      redirectUri: clientMetadata.redirectUri || "https://chatgpt.com/connector/oauth",
      clientName: "ChatGPT"
    });
  }

  async authorize(
    client: ClientMetadata,
    params: {
      redirectUri: string;
      state?: string;
      resource?: URL | null;
      scopes?: string[];
      codeChallenge?: string;
    },
    res: {
      req?: {
        method?: string;
        body?: Record<string, unknown>;
        query?: Record<string, unknown>;
        headers?: { cookie?: string };
      };
      redirect: (status: number, url: string) => void;
      cookie: (name: string, value: string, options: Record<string, unknown>) => void;
      status: (code: number) => { type: (type: string) => { send: (html: string) => void } };
    }
  ): Promise<void> {
    const req = res.req || {};
    const submittedUsername = String(req.body?.chatgptUsername || getPreferredChatgptUsername(req) || "").trim();
    const decision = String(req.body?.decision || "").trim();

    if (req.method !== "POST") {
      renderAuthorizePage(req, res, client, params);
      return;
    }

    if (decision === "deny") {
      const deniedUrl = new URL(params.redirectUri);
      deniedUrl.searchParams.set("error", "access_denied");
      deniedUrl.searchParams.set("error_description", "The user denied access.");
      if (params.state) {
        deniedUrl.searchParams.set("state", params.state);
      }
      res.redirect(302, deniedUrl.toString());
      return;
    }

    if (!submittedUsername) {
      renderAuthorizePage(req, res, client, params, "ChatGPT username is required.");
      return;
    }

    const code = this.createArtifact(
      "code",
      {
        clientId: client.client_id,
        username: submittedUsername,
        scopes: params.scopes || ["mcp:tools"],
        resource: params.resource?.href || null,
        codeChallenge: params.codeChallenge,
        redirectUri: params.redirectUri
      },
      5 * 60 * 1000
    );

    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (params.state) {
      redirectUrl.searchParams.set("state", params.state);
    }

    res.cookie("cgpt_username_hint", submittedUsername, {
      httpOnly: false,
      sameSite: "lax",
      secure: params.redirectUri.startsWith("https://"),
      maxAge: 1000 * 60 * 60 * 24 * 30,
      path: "/"
    });
    res.redirect(302, redirectUrl.toString());
  }

  async challengeForAuthorizationCode(client: ClientMetadata, authorizationCode: string): Promise<string> {
    const codeData = this.verifyArtifact(authorizationCode, "code");
    if (codeData.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid authorization code");
    }
    if (!codeData.codeChallenge) {
      throw new InvalidGrantError("Missing PKCE challenge");
    }
    return codeData.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: ClientMetadata,
    authorizationCode: string,
    _codeVerifier: string,
    redirectUri: string,
    resource?: URL | null
  ) {
    const codeData = this.verifyArtifact(authorizationCode, "code");
    if (codeData.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid authorization code");
    }
    if (redirectUri && codeData.redirectUri && redirectUri !== codeData.redirectUri) {
      throw new InvalidGrantError("redirect_uri does not match the original authorization request");
    }

    const tokenResource = resource?.href || codeData.resource || null;
    const accessToken = this.createArtifact(
      "access",
      {
        clientId: client.client_id,
        username: codeData.username,
        scopes: codeData.scopes || ["mcp:tools"],
        resource: tokenResource,
        redirectUri: codeData.redirectUri || redirectUri || null
      },
      3600 * 1000
    );
    const refreshToken = this.createArtifact(
      "refresh",
      {
        clientId: client.client_id,
        username: codeData.username,
        scopes: codeData.scopes || ["mcp:tools"],
        resource: tokenResource,
        redirectUri: codeData.redirectUri || redirectUri || null
      },
      1000 * 60 * 60 * 24 * 30
    );

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: (codeData.scopes || ["mcp:tools"]).join(" ")
    };
  }

  async exchangeRefreshToken(
    client: ClientMetadata,
    refreshToken: string,
    scopes?: string[],
    resource?: URL | null
  ) {
    const refreshRecord = this.verifyArtifact(refreshToken, "refresh");
    if (refreshRecord.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid refresh token");
    }

    const nextScopes = scopes?.length ? scopes : refreshRecord.scopes;
    const nextResource = resource?.href || refreshRecord.resource || null;
    const nextAccessToken = this.createArtifact(
      "access",
      {
        clientId: client.client_id,
        username: refreshRecord.username,
        scopes: nextScopes,
        resource: nextResource,
        redirectUri: refreshRecord.redirectUri || null
      },
      3600 * 1000
    );

    return {
      access_token: nextAccessToken,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: nextScopes.join(" ")
    };
  }

  async verifyAccessToken(token: string) {
    let tokenData: OAuthArtifact;
    try {
      tokenData = this.verifyArtifact(token, "access");
    } catch {
      throw new InvalidTokenError("Invalid or expired token");
    }

    const resource = tokenData.resource ? new URL(tokenData.resource) : undefined;

    return {
      token,
      clientId: tokenData.clientId,
      scopes: tokenData.scopes,
      expiresAt: Math.floor(tokenData.exp / 1000),
      resource,
      extra: {
        chatgptUsername: tokenData.username
      }
    };
  }
}

export function setupOAuth(
  app: Express,
  baseUrl: URL,
  { signingSecret }: { signingSecret: string }
) {
  const provider = new ChatGptOAuthProvider({ signingSecret });
  const rootResourceUrl = new URL("/", baseUrl);
  const mcpServerUrl = new URL("/mcp", baseUrl);
  const resourceMetadata = {
    authorization_servers: [baseUrl.href],
    scopes_supported: ["mcp:tools"],
    resource_name: "ChatGPT Dynamic UI",
    resource_documentation: rootResourceUrl.href
  };
  const oidcMetadata = {
    issuer: baseUrl.href,
    authorization_endpoint: new URL("/authorize", baseUrl).href,
    token_endpoint: new URL("/token", baseUrl).href,
    registration_endpoint: new URL("/register", baseUrl).href,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    scopes_supported: ["mcp:tools"]
  };

  app.use("/authorize", express.urlencoded({ extended: false }), async (req, _res, next) => {
    await provider.ensureClientForRequest(req);
    next();
  });

  app.use("/token", express.urlencoded({ extended: false }), async (req, _res, next) => {
    await provider.ensureClientForRequest(req);
    next();
  });

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: baseUrl,
      resourceServerUrl: mcpServerUrl,
      scopesSupported: ["mcp:tools"],
      resourceName: "ChatGPT Dynamic UI",
      serviceDocumentationUrl: new URL("/", baseUrl),
      authorizationOptions: { rateLimit: false },
      tokenOptions: { rateLimit: false },
      clientRegistrationOptions: { rateLimit: false }
    })
  );

  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      ...resourceMetadata,
      resource: rootResourceUrl.href
    });
  });
  app.get("/mcp/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      ...resourceMetadata,
      resource: mcpServerUrl.href
    });
  });

  app.get("/.well-known/openid-configuration", (_req, res) => {
    res.json(oidcMetadata);
  });

  app.get("/.well-known/openid-configuration/mcp", (_req, res) => {
    res.json(oidcMetadata);
  });
  app.get("/mcp/.well-known/openid-configuration", (_req, res) => {
    res.json(oidcMetadata);
  });
  app.get("/mcp/.well-known/oauth-authorization-server", (_req, res) => {
    res.json(oidcMetadata);
  });

  const authMiddleware = requireBearerAuth({
    verifier: provider,
    requiredScopes: [],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl)
  });
  const rootAuthMiddleware = requireBearerAuth({
    verifier: provider,
    requiredScopes: [],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(rootResourceUrl)
  });

  return {
    provider,
    authMiddleware,
    rootAuthMiddleware,
    mcpServerUrl
  };
}
