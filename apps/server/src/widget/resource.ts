import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.js";

const widgetDistDir = path.resolve(process.cwd(), "apps/widget/dist");

export const DYNAMIC_RUN_WIDGET_URI = "ui://widget/dynamic-run.html";
export const DYNAMIC_RUN_WIDGET_MIME_TYPE = "text/html;profile=mcp-app";

function originFromBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "http://localhost:8080";
  }
}

function withAbsoluteAssetPaths(html: string, baseUrl: string): string {
  return html.replaceAll('href="/widget-assets/', `href="${baseUrl}/widget-assets/`).replaceAll(
    'src="/widget-assets/',
    `src="${baseUrl}/widget-assets/`
  );
}

function fallbackWidgetHtml(baseUrl: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body {
        margin: 0;
        padding: 24px;
        font-family: Inter, system-ui, sans-serif;
        background: #f8fafc;
        color: #0f172a;
      }
      .card {
        border-radius: 20px;
        background: #fff;
        border: 1px solid rgba(15, 23, 42, 0.08);
        padding: 20px;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
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
    const indexHtml = await readFile(path.join(widgetDistDir, "index.html"), "utf8");
    return withAbsoluteAssetPaths(indexHtml, config.appBaseUrl);
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
