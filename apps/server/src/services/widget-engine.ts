import { Script } from "node:vm";
import type { AppConfig } from "../config.js";
import type { SharedCitation } from "../auth/adapter.js";

export type WidgetEnginePhase = {
  name: "visualize_read_me" | "show_widget" | "validate_widget" | "repair_widget";
  detail: string;
};

export type WidgetGenerationResult = {
  provider: "demo" | "openai";
  title: string;
  previewTitle: string;
  previewWidgetCode: string;
  widgetCode: string;
  assistantText: string;
  modules: string[];
  repaired: boolean;
  phases: WidgetEnginePhase[];
};

export type WidgetGenerationInput = {
  query: string;
  groundedText?: string;
  citations?: SharedCitation[];
  upstreamMode?: "shared-auth-service" | "demo";
};

type VisualizePlan = {
  modules: string[];
  rationale: string;
};

type WidgetPlan = {
  title: string;
  loading_messages: string[];
  widget_code: string;
  assistant_text?: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildWidgetPreviewHtml(query: string): string {
  const label = escapeHtml(query.trim() || "Preparing workspace");
  return [
    "<style>",
    ":root { color-scheme: light; }",
    "body { margin: 0; font-family: Inter, system-ui, sans-serif; background: linear-gradient(180deg, #f7f4ed 0%, #ffffff 100%); color: #1f2937; }",
    ".preview-shell { padding: 20px; border: 1px solid rgba(15, 23, 42, 0.08); border-radius: 20px; background: rgba(255,255,255,0.88); box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08); }",
    ".preview-label { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #8b5e3c; margin-bottom: 10px; }",
    ".preview-title { font-size: 26px; line-height: 1.2; margin: 0 0 8px; }",
    ".preview-copy { font-size: 14px; color: #475569; margin: 0; }",
    ".preview-bar { margin-top: 18px; height: 10px; border-radius: 999px; background: linear-gradient(90deg, #d97706, #f59e0b, #fde68a); background-size: 180% 100%; animation: sweep 1.4s ease-in-out infinite; }",
    "@keyframes sweep { 0% { background-position: 100% 0; } 100% { background-position: -80% 0; } }",
    "</style>",
    `<div class="preview-shell"><div class="preview-label">Dynamic Run</div><h1 class="preview-title">Building a live workspace</h1><p class="preview-copy">${label}</p><div class="preview-bar"></div></div>`
  ].join("");
}

function buildCitationList(citations: SharedCitation[] = []): string {
  if (citations.length === 0) {
    return "";
  }

  return [
    `<section class="panel"><strong>References</strong><div class="citation-list">`,
    ...citations
      .slice(0, 4)
      .map(
        (citation) =>
          `<a class="citation" href="${escapeHtml(citation.url)}" target="_blank" rel="noreferrer">${escapeHtml(citation.label)}</a>`
      ),
    "</div></section>"
  ].join("");
}

export function buildFinalWidgetHtml(input: WidgetGenerationInput): string {
  const query = input.query;
  const label = escapeHtml(query.trim() || "Dynamic workspace");
  const groundedText = escapeHtml(
    String(input.groundedText || "This widget is rendered from the orchestration pipeline and will be replaced by a model-authored fragment when OpenAI credentials are configured.").trim()
  );
  return [
    "<style>",
    ":root { color-scheme: light; }",
    "body { margin: 0; font-family: Inter, system-ui, sans-serif; background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%); color: #0f172a; }",
    ".workspace { padding: 22px; display: grid; gap: 16px; }",
    ".hero { padding: 20px; border-radius: 24px; background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%); color: #fff; box-shadow: 0 24px 60px rgba(30, 41, 59, 0.25); }",
    ".eyebrow { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.72; margin-bottom: 12px; }",
    ".hero h1 { margin: 0 0 10px; font-size: 28px; line-height: 1.15; }",
    ".hero p { margin: 0; font-size: 14px; color: rgba(255,255,255,0.82); }",
    ".metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }",
    ".metric { padding: 16px; border-radius: 18px; background: rgba(255,255,255,0.92); border: 1px solid rgba(148, 163, 184, 0.2); }",
    ".metric-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }",
    ".metric-value { margin-top: 8px; font-size: 26px; font-weight: 700; }",
    ".panel { padding: 18px; border-radius: 20px; background: rgba(255,255,255,0.92); border: 1px solid rgba(148, 163, 184, 0.18); }",
    ".bar-row { display: grid; gap: 10px; margin-top: 12px; }",
    ".bar { height: 10px; border-radius: 999px; background: linear-gradient(90deg, #1d4ed8 var(--value), #e2e8f0 var(--value)); }",
    ".action { margin-top: 12px; display: inline-flex; padding: 10px 14px; border-radius: 999px; background: #0f172a; color: #fff; text-decoration: none; font-weight: 600; }",
    ".citation-list { display: grid; gap: 8px; margin-top: 12px; }",
    ".citation { color: #1d4ed8; text-decoration: none; font-weight: 600; }",
    "@media (max-width: 720px) { .metrics { grid-template-columns: 1fr; } }",
    "</style>",
    `<div class="workspace">`,
    `<section class="hero"><div class="eyebrow">Dynamic Run</div><h1>${label}</h1><p>${groundedText}</p></section>`,
    `<section class="metrics"><div class="metric"><div class="metric-label">Opportunities</div><div class="metric-value">4</div></div><div class="metric"><div class="metric-label">At Risk</div><div class="metric-value">2</div></div><div class="metric"><div class="metric-label">Next Action</div><div class="metric-value">Now</div></div></section>`,
    `<section class="panel"><strong>Momentum</strong><div class="bar-row"><div class="bar" style="--value: 82%;"></div><div class="bar" style="--value: 61%;"></div><div class="bar" style="--value: 44%;"></div></div><a class="action" href="https://example.com" target="_blank" rel="noreferrer">Open supporting workflow</a></section>`,
    buildCitationList(input.citations),
    "</div>"
  ].join("");
}

export function buildAnswerText(input: WidgetGenerationInput): string {
  if (String(input.groundedText || "").trim()) {
    return String(input.groundedText || "").trim();
  }

  const label = input.query.trim() || "the requested workflow";
  return `I started a grounded dynamic run for ${label} and assembled a live workspace with reasoning, streamed text, and an interactive widget shell. This first slice is ready for the full visualize_read_me and show_widget model flow.`;
}

function sanitizeModules(modules: unknown): string[] {
  const allowed = new Set(["interactive", "chart", "mockup", "diagram", "art", "slds2"]);
  if (!Array.isArray(modules)) {
    return [];
  }

  return modules
    .map((module) => String(module || "").trim())
    .filter((module) => allowed.has(module));
}

function inferFallbackModules(query: string): string[] {
  const normalized = query.toLowerCase();
  const modules = new Set<string>(["interactive"]);
  if (/\b(chart|graph|trend|compare|pipeline|dashboard)\b/.test(normalized)) {
    modules.add("chart");
  }
  if (/\b(mockup|ui|card|cards|workspace)\b/.test(normalized)) {
    modules.add("mockup");
  }
  if (/\b(explain|how|diagram|architecture|workflow)\b/.test(normalized)) {
    modules.add("diagram");
  }
  if (/\b(salesforce|crm|opportunit|account|pipeline|forecast|deal)\b/.test(normalized)) {
    modules.add("slds2");
  }
  return [...modules];
}

function validateWidgetCode(widgetCode: string): string | null {
  const scriptTagPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const inlineScripts: string[] = [];
  let match: RegExpExecArray | null = null;
  let combinedInline = "";

  while ((match = scriptTagPattern.exec(widgetCode)) !== null) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    if (!/\bsrc\s*=/.test(attrs)) {
      inlineScripts.push(body);
      combinedInline += `\n${body}`;
      try {
        new Script(body);
      } catch (error) {
        return error instanceof Error ? error.message : "Invalid widget script.";
      }
    }
  }

  const onloadPattern = /<script\b[^>]*\bonload="([A-Za-z_$][\w$]*)\(/gi;
  while ((match = onloadPattern.exec(widgetCode)) !== null) {
    const fnName = match[1] ?? "";
    if (!fnName) {
      continue;
    }
    const hasDefinition = new RegExp(
      `(function\\s+${fnName}\\s*\\()|((const|let|var)\\s+${fnName}\\s*=)|(window\\.${fnName}\\s*=)`
    ).test(combinedInline);
    if (!hasDefinition) {
      return `Missing function definition for ${fnName} referenced by script onload.`;
    }
  }

  return null;
}

async function parseStructuredResponse<T>(
  response: Response,
  fallbackParser: (text: string) => T
): Promise<T> {
  const data = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  const outputText =
    String(data.output_text || "").trim() ||
    data.output
      ?.flatMap((item) => item.content || [])
      .find((part) => part.type === "output_text" && typeof part.text === "string")
      ?.text ||
    "";

  return fallbackParser(outputText);
}

function extractJson<T>(text: string): T {
  return JSON.parse(String(text || "").trim()) as T;
}

async function callResponsesApi<T>(args: {
  config: AppConfig;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.config.openaiApiKey}`
    },
    body: JSON.stringify({
      model: args.config.openaiWidgetModel,
      input: [
        { role: "system", content: args.system },
        { role: "user", content: args.user }
      ],
      text: {
        format: {
          type: "json_schema",
          name: args.schemaName,
          strict: true,
          schema: args.schema
        }
      }
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI Responses API failed (${response.status})${text ? `: ${text}` : ""}`);
  }

  return parseStructuredResponse<T>(response, extractJson<T>);
}

async function runOpenAiWidgetEngine(
  config: AppConfig,
  input: WidgetGenerationInput
): Promise<WidgetGenerationResult> {
  const query = input.query;
  const previewWidgetCode = buildWidgetPreviewHtml(query);
  const groundedText = String(input.groundedText || "").trim();
  const citations = input.citations || [];

  const visualize = await callResponsesApi<VisualizePlan>({
    config,
    system:
      "You choose the smallest correct visual guidance module set for a dynamic widget. Return JSON only.",
    user: [
      "Select widget design modules for this request.",
      `Query: ${query}`,
      groundedText ? `Grounded result summary:\n${groundedText}` : "",
      "Available modules: interactive, chart, mockup, diagram, art, slds2"
    ]
      .filter(Boolean)
      .join("\n\n"),
    schemaName: "visualize_plan",
    schema: {
      type: "object",
      properties: {
        modules: {
          type: "array",
          items: {
            type: "string",
            enum: ["interactive", "chart", "mockup", "diagram", "art", "slds2"]
          }
        },
        rationale: { type: "string" }
      },
      required: ["modules", "rationale"],
      additionalProperties: false
    }
  });

  const modules = sanitizeModules(visualize.modules);
  const selectedModules = modules.length > 0 ? modules : inferFallbackModules(query);

  const widgetPlan = await callResponsesApi<WidgetPlan>({
    config,
    system: [
      "You generate polished inline widget HTML fragments for a ChatGPT app.",
      "Return JSON only.",
      "The widget_code must be a fragment only: style first, HTML next, script last.",
      "Do not include markdown fences or a full document shell.",
      "Keep the UI polished and broad, not tiny or generic.",
      "Inline JavaScript is allowed.",
      "This should feel closer to a dynamic Claude-style artifact than a simple card.",
      "Prefer visible primary insight above the fold, dense metrics, and one dominant visual surface.",
      "If the data is Salesforce-oriented, use a Salesforce-friendly visual language without copying Salesforce chrome exactly."
    ].join(" "),
    user: [
      `User query: ${query}`,
      `Selected modules: ${selectedModules.join(", ")}`,
      input.upstreamMode ? `Grounded source mode: ${input.upstreamMode}` : "",
      groundedText ? `Grounded answer:\n${groundedText}` : "",
      citations.length > 0
        ? `Citations:\n${citations.map((citation) => `- ${citation.label}: ${citation.url}`).join("\n")}`
        : "",
      "Return title, loading_messages, widget_code, and assistant_text."
    ]
      .filter(Boolean)
      .join("\n\n"),
    schemaName: "widget_plan",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        loading_messages: {
          type: "array",
          items: { type: "string" }
        },
        widget_code: { type: "string" },
        assistant_text: { type: "string" }
      },
      required: ["title", "loading_messages", "widget_code", "assistant_text"],
      additionalProperties: false
    }
  });

  let widgetCode = String(widgetPlan.widget_code || "").trim();
  let title = String(widgetPlan.title || "generated_widget").trim() || "generated_widget";
  let repaired = false;
  const validationError = validateWidgetCode(widgetCode);

  if (validationError) {
    const repairedWidget = await callResponsesApi<WidgetPlan>({
      config,
      system: [
        "You repair inline widget HTML, CSS, and JS for a ChatGPT app.",
        "Return JSON only.",
        "Preserve the visual and interaction intent while fixing code issues."
      ].join(" "),
      user: [
        `User query: ${query}`,
        `Validation error: ${validationError}`,
        groundedText ? `Grounded answer:\n${groundedText}` : "",
        "Repair the widget and return a corrected title, loading_messages, widget_code, and assistant_text.",
        "Broken widget_code:",
        widgetCode
      ]
        .filter(Boolean)
        .join("\n\n"),
      schemaName: "repair_widget_plan",
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          loading_messages: {
            type: "array",
            items: { type: "string" }
          },
          widget_code: { type: "string" },
          assistant_text: { type: "string" }
        },
        required: ["title", "loading_messages", "widget_code", "assistant_text"],
        additionalProperties: false
      }
    });

    widgetCode = String(repairedWidget.widget_code || "").trim();
    title = String(repairedWidget.title || title).trim() || title;
    const repairedValidationError = validateWidgetCode(widgetCode);
    if (repairedValidationError) {
      throw new Error(`Repaired widget failed validation: ${repairedValidationError}`);
    }
    repaired = true;
  }

  return {
    provider: "openai",
    title,
    previewTitle: title,
    previewWidgetCode,
    widgetCode,
    assistantText:
      String(widgetPlan.assistant_text || buildAnswerText(input)).trim() || buildAnswerText(input),
    modules: selectedModules,
    repaired,
    phases: [
      {
        name: "visualize_read_me",
        detail: `Selected modules: ${selectedModules.join(", ")}`
      },
      {
        name: "show_widget",
        detail: `Generated widget ${title}`
      },
      {
        name: "validate_widget",
        detail: repaired ? "Validation failed once and triggered repair." : "Widget passed validation."
      },
      ...(repaired
        ? [
            {
              name: "repair_widget" as const,
              detail: "Repaired widget code and revalidated successfully."
            }
          ]
        : [])
    ]
  };
}

function runDemoWidgetEngine(input: WidgetGenerationInput): WidgetGenerationResult {
  const modules = inferFallbackModules(input.query);
  return {
    provider: "demo",
    title: "dynamic_run_workspace",
    previewTitle: "dynamic_run_preview",
    previewWidgetCode: buildWidgetPreviewHtml(input.query),
    widgetCode: buildFinalWidgetHtml(input),
    assistantText: buildAnswerText(input),
    modules,
    repaired: false,
    phases: [
      {
        name: "visualize_read_me",
        detail: `Demo selected modules: ${modules.join(", ")}`
      },
      {
        name: "show_widget",
        detail: "Demo widget generated."
      },
      {
        name: "validate_widget",
        detail: "Demo widget is prevalidated."
      }
    ]
  };
}

export class WidgetEngine {
  constructor(private readonly config: AppConfig) {}

  hasOpenAiSupport(): boolean {
    return Boolean(String(this.config.openaiApiKey || "").trim());
  }

  buildPreview(query: string): string {
    return buildWidgetPreviewHtml(query);
  }

  async generate(input: WidgetGenerationInput): Promise<WidgetGenerationResult> {
    if (!this.hasOpenAiSupport()) {
      return runDemoWidgetEngine(input);
    }

    try {
      return await runOpenAiWidgetEngine(this.config, input);
    } catch (error) {
      console.warn("[widget-engine] openai generation failed, falling back to demo", error);
      return runDemoWidgetEngine(input);
    }
  }
}
