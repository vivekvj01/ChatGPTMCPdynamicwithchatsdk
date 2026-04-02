import { Script } from "node:vm";
import { buildInlineTokenCss } from "@chatgpt-mcp-dynamic/shared";
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
  upstreamMode?: "shared-auth-service" | "direct-agentforce" | "demo";
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

const VISUALIZE_SYSTEM_PROMPT = [
  "You choose the smallest correct visual guidance module set for a dynamic widget.",
  "Return JSON only.",
  "Be selective. Fewer modules is better unless the request genuinely needs more than one.",
  "interactive: use when the user should explore, compare, filter, or take follow-up actions.",
  "chart: use when the grounded result contains numeric comparisons, trends, rankings, or measures that benefit from visual encoding.",
  "mockup: use for record views, workspaces, cards, dashboard shells, and operational layouts.",
  "diagram: use for process explanations, architecture, workflows, and relationships rather than live record presentation.",
  "slds2: use when the content is strongly Salesforce CRM data or should feel Salesforce-native without copying Lightning exactly.",
  "art: almost never use for business search results; reserve it for explicit illustration/art requests."
].join(" ");

const WIDGET_SYSTEM_PROMPT = [
  "You generate polished inline widget HTML fragments for a ChatGPT app.",
  "Return JSON only.",
  "The widget_code must be a fragment only: style first, HTML next, script last.",
  "Do not include markdown fences or a full document shell.",
  "This widget appears inside a refined ChatGPT artifact frame, so the fragment should feel intentional and editorial, not like a generic admin dashboard.",
  "Use a warm, high-craft product language: broad layout, calm surfaces, careful hierarchy, and restrained color.",
  "Inline JavaScript is allowed.",
  "Prefer one dominant visual surface and one strong primary insight above the fold.",
  "Do not fabricate precise metrics, counts, dates, or rankings that are not supported by the grounded answer.",
  "If the grounded answer is qualitative, present qualitative synthesis instead of invented KPI cards.",
  "If the data is Salesforce-oriented, use a Salesforce-friendly visual language without copying Salesforce chrome exactly.",
  "Avoid generic placeholder structures like three arbitrary stats plus one button unless the grounded answer truly supports them.",
  "Use sendPrompt('...') only for high-value follow-up actions that benefit from the model reasoning further.",
  "Use openLink(url) or normal links only when a citation or record action is actually present."
].join(" ");

const REPAIR_SYSTEM_PROMPT = [
  "You repair inline widget HTML, CSS, and JS for a ChatGPT app.",
  "Return JSON only.",
  "Preserve the visual and interaction intent while fixing code issues.",
  "Do not simplify the widget into a generic card unless the broken code gives you no other safe path.",
  "Keep the layout broad and intentional.",
  "If the grounded answer is qualitative, preserve qualitative presentation rather than inventing KPI tiles.",
  "Do not invent unsupported metrics or content while repairing.",
  "Do not return a full HTML document. Return only the fragment."
].join(" ");

function buildVisualizeUserPrompt(input: WidgetGenerationInput): string {
  const groundedText = String(input.groundedText || "").trim();

  return [
    "Select widget design modules for this request.",
    `Query: ${input.query}`,
    input.upstreamMode ? `Grounded source mode: ${input.upstreamMode}` : "",
    groundedText ? `Grounded result summary:\n${groundedText}` : "",
    "Available modules: interactive, chart, mockup, diagram, art, slds2",
    "Guidance:",
    "- Prefer mockup + slds2 for Salesforce record/workspace views.",
    "- Add chart only when there is clear quantitative structure to visualize.",
    "- Add interactive when the user should compare, inspect, filter, or continue the workflow.",
    "- Prefer diagram for explanatory 'how it works' requests, not live CRM result views.",
    "- Avoid art for operational business queries."
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildWidgetUserPrompt(input: WidgetGenerationInput, selectedModules: string[]): string {
  const groundedText = String(input.groundedText || "").trim();
  const citations = input.citations || [];

  return [
    `User query: ${input.query}`,
    `Selected modules: ${selectedModules.join(", ")}`,
    input.upstreamMode ? `Grounded source mode: ${input.upstreamMode}` : "",
    groundedText ? `Grounded answer:\n${groundedText}` : "",
    citations.length > 0
      ? `Citations:\n${citations.map((citation) => `- ${citation.label}: ${citation.url}`).join("\n")}`
      : "",
    "Design requirements:",
    "- Make the first screen feel like a finished artifact, not a wireframe.",
    "- Use concise labels and strong hierarchy.",
    "- Show one main insight first, then supporting structure.",
    "- If the grounded answer lacks numeric detail, do not invent stat cards. Use narrative panels, lists, timelines, evidence, or action areas instead.",
    "- If you do show metrics, they must be supported by the grounded answer.",
    "- Keep the fragment fully self-contained.",
    "- Produce loading_messages that sound product-like, not technical.",
    "Return title, loading_messages, widget_code, and assistant_text."
  ]
    .filter(Boolean)
    .join("\n\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function splitIntoSentences(text: string): string[] {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildEvidenceItems(text: string): string[] {
  const sentences = splitIntoSentences(text);
  if (sentences.length > 0) {
    return sentences.slice(0, 4);
  }

  return String(text || "")
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function inferFollowUpPrompt(query: string): string {
  const normalized = query.trim();
  if (!normalized) {
    return "Show me the strongest supporting evidence for this workspace.";
  }
  return `Go deeper on: ${normalized}`;
}

export function buildWidgetPreviewHtml(query: string): string {
  const label = escapeHtml(query.trim() || "Preparing workspace");
  return [
    "<style>",
    ":root { color-scheme: light; }",
    buildInlineTokenCss(),
    'body { margin: 0; font-family: var(--font-sans); font-feature-settings: "cv03", "cv04", "cv11"; background: linear-gradient(180deg, #f7f4ed 0%, #ffffff 100%); color: var(--color-text); }',
    ".preview-shell { padding: 20px; border: 1px solid var(--color-border); border-radius: var(--radius-inner); background: rgba(255,255,255,0.9); box-shadow: var(--shadow-card); }",
    ".preview-label { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #8b5e3c; margin-bottom: 10px; }",
    ".preview-title { font-family: var(--font-serif); font-size: 30px; font-weight: 400; letter-spacing: -0.03em; line-height: 0.98; margin: 0 0 8px; }",
    ".preview-copy { font-size: 14px; color: var(--color-text-secondary); margin: 0; }",
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
  const groundedText = String(
    input.groundedText ||
      "The workspace is waiting for a grounded result. When one arrives, this artifact will reshape around the evidence."
  ).trim();
  const evidenceItems = buildEvidenceItems(groundedText);
  const followUpPrompt = escapeHtml(inferFollowUpPrompt(query));
  return [
    "<style>",
    ":root { color-scheme: light; }",
    buildInlineTokenCss(),
    'body { margin: 0; font-family: var(--font-sans); font-feature-settings: "cv03", "cv04", "cv11"; background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%); color: var(--color-text); }',
    ".workspace { padding: 22px; display: grid; gap: 16px; }",
    ".hero { padding: 20px; border-radius: 24px; background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%); color: #fff; box-shadow: 0 24px 60px rgba(30, 41, 59, 0.25); }",
    ".eyebrow { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.72; margin-bottom: 12px; }",
    ".hero h1 { margin: 0 0 10px; font-family: var(--font-serif); font-size: 34px; font-weight: 400; letter-spacing: -0.03em; line-height: 0.98; }",
    ".hero p { margin: 0; font-size: 14px; color: rgba(255,255,255,0.82); }",
    ".evidence-grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 12px; }",
    ".panel { padding: 18px; border-radius: 20px; background: rgba(255,255,255,0.92); border: 1px solid rgba(148, 163, 184, 0.18); }",
    ".panel h2 { margin: 0 0 10px; font-size: 18px; letter-spacing: -0.02em; }",
    ".evidence-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }",
    ".evidence-list li { position: relative; padding-left: 18px; line-height: 1.55; color: var(--color-text-secondary); }",
    ".evidence-list li::before { content: ''; position: absolute; left: 0; top: 0.65em; width: 8px; height: 8px; border-radius: 999px; background: var(--color-accent-soft); box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.2); }",
    ".summary-card { display: grid; gap: 12px; align-content: start; }",
    ".summary-kicker { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-text-muted); }",
    ".summary-copy { margin: 0; font-size: 14px; line-height: 1.6; color: var(--color-text-secondary); }",
    ".action { margin-top: 6px; display: inline-flex; padding: 10px 14px; border-radius: 999px; background: #0f172a; color: #fff; text-decoration: none; font-weight: 600; border: 0; cursor: pointer; }",
    ".action.secondary { background: rgba(37, 99, 235, 0.08); color: var(--color-accent); }",
    ".citation-list { display: grid; gap: 8px; margin-top: 12px; }",
    ".citation { color: #1d4ed8; text-decoration: none; font-weight: 600; }",
    "@media (max-width: 720px) { .evidence-grid { grid-template-columns: 1fr; } }",
    "</style>",
    `<div class="workspace">`,
    `<section class="hero"><div class="eyebrow">Dynamic Run</div><h1>${label}</h1><p>${escapeHtml(groundedText)}</p></section>`,
    `<section class="evidence-grid"><section class="panel"><h2>Evidence snapshot</h2><ul class="evidence-list">${evidenceItems
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("")}</ul></section><section class="panel summary-card"><div class="summary-kicker">Next move</div><p class="summary-copy">Keep exploring the grounded result, inspect supporting sources, or ask the model to dig deeper on one thread.</p><button class="action" onclick="sendPrompt('${followUpPrompt}')">Go deeper</button><button class="action secondary" onclick="sendPrompt('Summarize the strongest supporting evidence for this result.')">Summarize evidence</button></section></section>`,
    buildCitationList(input.citations),
    "</div>"
  ].join("");
}

export function buildAnswerText(input: WidgetGenerationInput): string {
  if (String(input.groundedText || "").trim()) {
    return String(input.groundedText || "").trim();
  }

  const label = input.query.trim() || "the requested workflow";
  return `I started a grounded dynamic run for ${label} and assembled a live workspace with reasoning, streamed text, and an interactive artifact view.`;
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
  const normalized = String(widgetCode || "").trim();
  if (!normalized) {
    return "Widget code is empty.";
  }

  if (/<!doctype|<html\b|<head\b|<body\b/i.test(normalized)) {
    return "Widget code must be an inline fragment, not a full HTML document.";
  }

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

function buildFallbackReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.trim()) {
    return "OpenAI widget generation was unavailable.";
  }

  return `The workspace kept the grounded answer intact while switching to a resilient fallback artifact because ${message.replace(/\.$/, "")}.`;
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
    system: VISUALIZE_SYSTEM_PROMPT,
    user: buildVisualizeUserPrompt(input),
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
    system: WIDGET_SYSTEM_PROMPT,
    user: buildWidgetUserPrompt(input, selectedModules),
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
      system: REPAIR_SYSTEM_PROMPT,
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

function runDemoWidgetEngine(
  input: WidgetGenerationInput,
  options?: { fallbackReason?: string }
): WidgetGenerationResult {
  const modules = inferFallbackModules(input.query);
  const fallbackReason = String(options?.fallbackReason || "").trim();
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
        detail: `Selected modules: ${modules.join(", ")}`
      },
      {
        name: "show_widget",
        detail: fallbackReason ? "Generated a resilient fallback workspace." : "Generated grounded artifact workspace."
      },
      {
        name: "validate_widget",
        detail: "Widget template passed validation."
      },
      ...(fallbackReason
        ? [
            {
              name: "repair_widget" as const,
              detail: fallbackReason
            }
          ]
        : [])
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
      return runDemoWidgetEngine(input, {
        fallbackReason: buildFallbackReason(error)
      });
    }
  }
}
