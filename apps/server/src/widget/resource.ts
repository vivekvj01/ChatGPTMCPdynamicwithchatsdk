import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildInlineTokenCss, designTokens } from "@chatgpt-mcp-dynamic/shared";
import type { AppConfig } from "../config.js";
import { resolveWidgetDistDir } from "../paths.js";

const widgetDistDir = resolveWidgetDistDir(import.meta.url);

export const DYNAMIC_RUN_WIDGET_URI = "ui://widget/dynamic-run-v2.html";
export const DYNAMIC_RUN_WIDGET_MIME_TYPE = "text/html;profile=mcp-app";

function originFromBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "http://localhost:8080";
  }
}

function escapeInlineScript(value: string): string {
  return String(value || "").replace(/<\/script/gi, "<\\/script");
}

async function inlineBuiltWidgetHtml(baseUrl: string): Promise<string> {
  const indexHtml = await readFile(path.join(widgetDistDir, "index.html"), "utf8");
  const scriptMatch = indexHtml.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/i);
  const styleMatch = indexHtml.match(/<link[^>]+href="([^"]+)"[^>]*>/i);

  const scriptPath = scriptMatch?.[1];
  const stylePath = styleMatch?.[1];

  if (!scriptPath || !stylePath) {
    throw new Error("Widget bundle assets were not found in index.html.");
  }

  const normalizedScriptPath = scriptPath.replace(/^\//, "");
  const normalizedStylePath = stylePath.replace(/^\//, "");
  const [scriptContent, styleContent] = await Promise.all([
    readFile(path.join(widgetDistDir, normalizedScriptPath.replace(/^widget-assets\//, "")), "utf8"),
    readFile(path.join(widgetDistDir, normalizedStylePath.replace(/^widget-assets\//, "")), "utf8")
  ]);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${buildInlineTokenCss()}</style>
    <style>${styleContent}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.__DYNAMIC_WIDGET_CONFIG__ = ${JSON.stringify({ appBaseUrl: baseUrl }).replace(/</g, "\\u003c")};
    </script>
    <script type="module">${escapeInlineScript(scriptContent)}</script>
  </body>
</html>`;
}

function fallbackWidgetHtml(baseUrl: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      ${buildInlineTokenCss()}
      body {
        margin: 0;
        padding: 24px;
        font-family: var(--font-sans);
        font-feature-settings: "cv03", "cv04", "cv11";
        background:
          radial-gradient(circle at top left, rgba(255,255,255,0.88), transparent 36%),
          linear-gradient(180deg, ${designTokens.colorBg} 0%, #efefec 100%);
        color: var(--color-text);
      }
      .card {
        border-radius: var(--radius-card);
        background: rgba(255,255,255,0.92);
        border: 1px solid var(--color-border);
        padding: 20px;
        box-shadow: var(--shadow-card);
      }
      code {
        font-family: var(--font-mono);
      }
      p { color: var(--color-text-secondary); line-height: 1.6; }
      h1 { margin: 0 0 10px; font-size: 24px; letter-spacing: -0.02em; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Widget bundle missing</h1>
      <p>Run <code>npm run build</code> before connecting this app to ChatGPT.</p>
      <p>Expected static bundle at <code>${baseUrl}/widget-assets</code>.</p>
    </div>
  </body>
</html>`;
}

export async function getDynamicRunWidgetHtml(config: AppConfig): Promise<string> {
  try {
    return await inlineBuiltWidgetHtml(config.appBaseUrl);
  } catch {
    return fallbackWidgetHtml(config.appBaseUrl);
  }
}

export function buildDynamicRunWidgetResourceMeta(config: AppConfig) {
  const domain = originFromBaseUrl(config.appBaseUrl);
  return {
    ui: {
      prefersBorder: true,
      csp: {
        connectDomains: [domain],
        resourceDomains: [
          domain,
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
          "https://esm.sh"
        ]
      },
      domain
    },
    "openai/widgetDescription":
      "Streams dynamic run progress, grounded text, and model-generated widget UI for the current ChatGPT app invocation.",
    "openai/widgetPrefersBorder": true,
    "openai/widgetCSP": {
      connect_domains: [domain],
      resource_domains: [
        domain,
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
        "https://esm.sh"
      ]
    },
    "openai/widgetDomain": domain
  };
}
