import { Script } from "node:vm";
import { buildInlineTokenCss, designTokens } from "@chatgpt-mcp-dynamic/shared";
import type { AppConfig } from "../config.js";
import type { SharedCitation } from "../auth/adapter.js";

export type WidgetEnginePhase = {
  name: "visualize_read_me" | "show_widget" | "validate_widget" | "repair_widget";
  detail: string;
};

export type WidgetGenerationResult = {
  provider: "demo" | "openai" | "heroku";
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
  visualPreferences?: WidgetVisualPreferences;
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

type StructuredGenerationProvider = "openai" | "heroku";

type HerokuChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

type WidgetRecord = {
  label: string;
  url: string;
};

export type WidgetVisualPreferences = {
  paletteName: string;
  chartStyle: string;
  fonts: {
    sans: string;
    serif: string;
    mono: string;
    rules: string[];
  };
  icons: {
    style: string;
    rules: string[];
  };
  table: {
    style: string;
    rules: string[];
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    rules: string[];
  };
  radius: {
    card: string;
    inner: string;
    rules: string[];
  };
  shadows: {
    card: string;
    raised: string;
    rules: string[];
  };
  requiredCssVars: string[];
  componentRules: string[];
  palette: {
    background: string;
    surface: string;
    surfaceSoft: string;
    text: string;
    textSecondary: string;
    muted: string;
    border: string;
    accent: string;
    accentSoft: string;
    success: string;
    warning: string;
    error: string;
  };
  rules: string[];
};

const DEFAULT_VISUAL_PREFERENCES: WidgetVisualPreferences = {
  paletteName: "agentforce-shell",
  chartStyle: "horizontal ranked bar chart",
  fonts: {
    sans: designTokens.fontSans,
    serif: designTokens.fontSerif,
    mono: designTokens.fontMono,
    rules: [
      "Use the shared font CSS variables for typography.",
      "Use var(--font-sans) for body/interface copy, var(--font-serif) only for editorial display moments, and var(--font-mono) only for code or compact metadata.",
      "Do not import or invent a different font system."
    ]
  },
  icons: {
    style: "minimal inline SVG icons only",
    rules: [
      "Use inline SVG icons only when necessary.",
      "Do not use emoji, icon fonts, or third-party icon kits.",
      "Keep icons stroke-based, minimal, and secondary to the data."
    ]
  },
  table: {
    style: "semantic table with muted uppercase headers, subtle row dividers, neutral surfaces, and readable numeric alignment",
    rules: [
      "Use semantic table elements for naturally tabular data.",
      "Use muted uppercase headers, subtle row dividers, and neutral surfaces.",
      "Avoid cardifying tabular data unless the content is not truly tabular."
    ]
  },
  spacing: {
    xs: designTokens.spacingXs,
    sm: designTokens.spacingSm,
    md: designTokens.spacingMd,
    lg: designTokens.spacingLg,
    xl: designTokens.spacingXl,
    rules: [
      "Use the shared spacing variables instead of ad hoc spacing values.",
      "Prefer var(--spacing-md) and var(--spacing-lg) for main layout rhythm.",
      "Keep density calm and consistent."
    ]
  },
  radius: {
    card: designTokens.radiusCard,
    inner: designTokens.radiusInner,
    rules: [
      "Use the shared radius variables for panels, tables, and interactive controls.",
      "Do not invent square or super-rounded shapes outside the token set."
    ]
  },
  shadows: {
    card: designTokens.shadowCard,
    raised: designTokens.shadowRaised,
    rules: [
      "Use the shared shadow variables for depth.",
      "Keep shadows soft and restrained."
    ]
  },
  requiredCssVars: [
    "--font-sans",
    "--font-serif",
    "--font-mono",
    "--color-bg",
    "--color-surface",
    "--color-surface-soft",
    "--color-border",
    "--color-border-strong",
    "--color-text",
    "--color-text-secondary",
    "--color-text-muted",
    "--color-accent",
    "--color-accent-soft",
    "--color-success",
    "--color-warning",
    "--color-error",
    "--shadow-card",
    "--shadow-raised",
    "--spacing-xs",
    "--spacing-sm",
    "--spacing-md",
    "--spacing-lg",
    "--spacing-xl",
    "--radius-card",
    "--radius-inner"
  ],
  componentRules: [
    "Use the shared CSS variables in the generated style block rather than hardcoding a fresh visual system.",
    "Use semantic tables for tabular data and a consolidated horizontal ranked bar chart for ranked comparisons.",
    "Use neutral surfaces, restrained shadows, and accent blue for primary quantitative emphasis.",
    "Buttons, filters, cards, and panels should align to the shared shell tokens.",
    "Keep visible labels business-facing and outcome-focused; never surface internal implementation names like chart styles, token names, or module names in the UI.",
    "Use one dominant surface architecture: avoid stacking multiple full-width rounded outer cards inside the artifact unless the data truly needs sectional separation."
  ],
  palette: {
    background: designTokens.colorBg,
    surface: designTokens.colorSurface,
    surfaceSoft: designTokens.colorSurfaceSoft,
    text: designTokens.colorText,
    textSecondary: designTokens.colorTextSecondary,
    muted: designTokens.colorTextMuted,
    border: designTokens.colorBorder,
    accent: designTokens.colorAccent,
    accentSoft: designTokens.colorAccentSoft,
    success: designTokens.colorSuccess,
    warning: designTokens.colorWarning,
    error: designTokens.colorError
  },
  rules: [
    "Use the fixed Agentforce shell palette exactly; do not invent a different dominant palette.",
    "Use the shared shell typography via CSS variables rather than inventing a new font system.",
    "Use the accent color as the primary quantitative chart color and keep other chart surfaces neutral.",
    "Do not use beige, brown, tan, or orange as the dominant chart color unless the accent itself is one of those colors.",
    "When the request is a ranked numeric comparison and chart is selected, render the primary quantitative view as a horizontal ranked bar chart.",
    "Do not substitute repeated progress-bar cards for the main chart.",
    "Prefer one consolidated chart region above supporting details.",
    "Use the shared spacing, radius, shadow, and color CSS variables in the generated fragment.",
    "Keep tables, buttons, and panels aligned to the shared shell tokens.",
    "Use semantic tables, minimal inline SVG icons, and shared font variables.",
    "Treat chart style names and component implementation details as internal guidance only, not visible copy.",
    "Assume the ChatGPT artifact frame already provides an outer shell; do not recreate a second dashboard shell with multiple nested framed containers."
  ]
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
  "Use a broad layout, calm surfaces, careful hierarchy, and the fixed visual preferences provided by the user prompt.",
  "Inline JavaScript is allowed.",
  "Prefer one dominant visual surface and one strong primary insight above the fold.",
  "Do not fabricate precise metrics, counts, dates, or rankings that are not supported by the grounded answer.",
  "If the grounded answer is qualitative, present qualitative synthesis instead of invented KPI cards.",
  "If the data is Salesforce-oriented, use a Salesforce-friendly visual language without copying Salesforce chrome exactly.",
  "Avoid generic placeholder structures like three arbitrary stats plus one button unless the grounded answer truly supports them.",
  "If the prompt gives a fixed palette or chart style, treat those as hard requirements rather than suggestions.",
  "Assume the ChatGPT artifact already provides the outer frame.",
  "Keep the widget root visually quiet or transparent and concentrate the visual weight in one primary surface.",
  "Avoid stacking multiple large rounded containers one inside another unless the content genuinely needs sectional separation.",
  "Do not render a full-bleed outer white or cream wrapper around the entire widget.",
  "Do not introduce a large inset hero card around the top insight unless the content truly requires sectional separation.",
  "Use sendPrompt('...') only for high-value follow-up actions that benefit from the model reasoning further.",
  "Use openLink(url) or normal links only when a citation or record action is actually present."
].join(" ");

const REPAIR_SYSTEM_PROMPT = [
  "You repair inline widget HTML, CSS, and JS for a ChatGPT app.",
  "Return JSON only.",
  "Preserve the visual and interaction intent while fixing code issues.",
  "Do not simplify the widget into a generic card unless the broken code gives you no other safe path.",
  "Keep the layout broad and intentional.",
  "Keep any fixed palette or chart-style requirements intact.",
  "Keep internal implementation labels out of the visible UI; use business-facing headings and captions instead.",
  "If the grounded answer is qualitative, preserve qualitative presentation rather than inventing KPI tiles.",
  "Do not invent unsupported metrics or content while repairing.",
  "Reduce unnecessary inset hero cards and nested framed containers while repairing.",
  "Do not return a full HTML document. Return only the fragment."
].join(" ");

function resolveVisualPreferences(input: WidgetGenerationInput): WidgetVisualPreferences {
  return input.visualPreferences || DEFAULT_VISUAL_PREFERENCES;
}

function buildVisualPreferencesPrompt(input: WidgetGenerationInput): string {
  const preferences = resolveVisualPreferences(input);

  return [
    "Fixed visual preferences:",
    `- Palette name: ${preferences.paletteName}`,
    `- Required chart style for ranked numeric comparisons: ${preferences.chartStyle}`,
    `- Sans font: ${preferences.fonts.sans}`,
    `- Serif font: ${preferences.fonts.serif}`,
    `- Mono font: ${preferences.fonts.mono}`,
    `- Icon style: ${preferences.icons.style}`,
    `- Table style: ${preferences.table.style}`,
    `- Spacing xs: ${preferences.spacing.xs}`,
    `- Spacing sm: ${preferences.spacing.sm}`,
    `- Spacing md: ${preferences.spacing.md}`,
    `- Spacing lg: ${preferences.spacing.lg}`,
    `- Spacing xl: ${preferences.spacing.xl}`,
    `- Radius card: ${preferences.radius.card}`,
    `- Radius inner: ${preferences.radius.inner}`,
    `- Shadow card: ${preferences.shadows.card}`,
    `- Shadow raised: ${preferences.shadows.raised}`,
    `- Background: ${preferences.palette.background}`,
    `- Surface: ${preferences.palette.surface}`,
    `- Surface soft: ${preferences.palette.surfaceSoft}`,
    `- Text: ${preferences.palette.text}`,
    `- Text secondary: ${preferences.palette.textSecondary}`,
    `- Muted text: ${preferences.palette.muted}`,
    `- Border: ${preferences.palette.border}`,
    `- Accent: ${preferences.palette.accent}`,
    `- Accent soft: ${preferences.palette.accentSoft}`,
    `- Success: ${preferences.palette.success}`,
    `- Warning: ${preferences.palette.warning}`,
    `- Error: ${preferences.palette.error}`,
    "Required CSS variables:",
    ...preferences.requiredCssVars.map((cssVar) => `- ${cssVar}`),
    "Font rules:",
    ...preferences.fonts.rules.map((rule) => `- ${rule}`),
    "Icon rules:",
    ...preferences.icons.rules.map((rule) => `- ${rule}`),
    "Table rules:",
    ...preferences.table.rules.map((rule) => `- ${rule}`),
    "Spacing rules:",
    ...preferences.spacing.rules.map((rule) => `- ${rule}`),
    "Radius rules:",
    ...preferences.radius.rules.map((rule) => `- ${rule}`),
    "Shadow rules:",
    ...preferences.shadows.rules.map((rule) => `- ${rule}`),
    "Component rules:",
    ...preferences.componentRules.map((rule) => `- ${rule}`),
    "Rules:",
    ...preferences.rules.map((rule) => `- ${rule}`)
  ].join("\n");
}

function buildVisualizeUserPrompt(input: WidgetGenerationInput): string {
  const groundedText = truncateForPrompt(String(input.groundedText || "").trim(), 2400);

  return [
    "Select widget design modules for this request.",
    `Query: ${input.query}`,
    input.upstreamMode ? `Grounded source mode: ${input.upstreamMode}` : "",
    groundedText ? `Grounded result summary:\n${groundedText}` : "",
    "Available modules: interactive, chart, mockup, diagram, art, slds2",
    buildVisualPreferencesPrompt(input),
    "Guidance:",
    "- Prefer mockup + slds2 for Salesforce record/workspace views.",
    "- Add chart only when there is clear quantitative structure to visualize.",
    "- Add interactive when the user should compare, inspect, filter, or continue the workflow.",
    "- Prefer diagram for explanatory 'how it works' requests, not live CRM result views.",
    "- Avoid art for operational business queries.",
    "- Treat chart-style names and token names as internal implementation guidance, not user-facing copy."
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildWidgetUserPrompt(input: WidgetGenerationInput, selectedModules: string[]): string {
  const groundedText = truncateForPrompt(String(input.groundedText || "").trim(), 4200);
  const citations = (input.citations || []).slice(0, 8);

  return [
    `User query: ${input.query}`,
    `Selected modules: ${selectedModules.join(", ")}`,
    input.upstreamMode ? `Grounded source mode: ${input.upstreamMode}` : "",
    groundedText ? `Grounded answer:\n${groundedText}` : "",
    buildVisualPreferencesPrompt(input),
    citations.length > 0
      ? `Citations:\n${citations.map((citation) => `- ${citation.label}: ${citation.url}`).join("\n")}`
      : "",
    "Design requirements:",
    "- Make the first screen feel like a finished artifact, not a wireframe.",
    "- Use concise labels and strong hierarchy.",
    "- Show one main insight first, then supporting structure.",
    "- If the grounded answer lacks numeric detail, do not invent stat cards. Use narrative panels, lists, timelines, evidence, or action areas instead.",
    "- If you do show metrics, they must be supported by the grounded answer.",
    "- Follow the fixed palette exactly.",
    "- If chart is selected for ranked numeric output, the main quantitative view must use the required horizontal ranked bar chart pattern.",
    "- Do not expose internal implementation names in visible labels, headings, captions, or legend text.",
    "- Use business-facing chart and table titles that describe the data, not the rendering technique.",
    "- Assume the artifact frame already gives you the outer shell; do not build a second full-page shell inside the widget.",
    "- Keep the widget root visually quiet or transparent and use one primary card or surface for the main story above the fold.",
    "- Avoid alternating nested cream/white framed wrappers unless the content truly needs separate sections.",
    "- Do not render a full-bleed outer white or cream wrapper around the entire widget; let it visually blend into the ChatGPT background.",
    "- Do not wrap the top insight in a large inset hero card unless separation is truly needed.",
    "- Use the required shared CSS variables in your style block and component styling.",
    "- Follow the fixed font, icon, table, spacing, radius, shadow, and component rules exactly.",
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

function normalizeWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateForPrompt(value: string, maxLength: number): string {
  const normalized = String(value || "").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function buildHerokuChatBaseUrl(rawUrl?: string | null): string {
  const base = String(rawUrl || "").trim().replace(/^['"]|['"]$/g, "");
  const trimmed = (base || "https://us.inference.heroku.com").replace(/\/+$/g, "");

  if (trimmed.endsWith("/v1/chat/completions") || trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractChatCompletionText(
  content: string | Array<{ type?: string; text?: string }> | undefined
): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
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

function extractMarkdownRecords(text: string): WidgetRecord[] {
  const records: WidgetRecord[] = [];
  const seen = new Set<string>();
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(text)) !== null && records.length < 8) {
    const label = normalizeWhitespace(match[1]);
    const url = normalizeWhitespace(match[2]);
    const key = `${label}|${url}`.toLowerCase();
    if (!label || !url || seen.has(key)) {
      continue;
    }
    seen.add(key);
    records.push({ label, url });
  }

  return records;
}

function replaceMarkdownLinksWithLabels(text: string): string {
  return String(text || "").replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1");
}

function normalizeGroundedNarrative(text: string): string {
  return replaceMarkdownLinksWithLabels(
    String(text || "")
      .replace(/\|\s*/g, ", ")
      .replace(/\n{3,}/g, "\n\n")
  ).trim();
}

function buildNarrativeParagraphs(text: string): string[] {
  const normalized = normalizeGroundedNarrative(text)
    .split(/\n{2,}/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  if (normalized.length > 0) {
    return normalized.slice(0, 3);
  }

  return splitIntoSentences(text).slice(0, 3);
}

function buildStructuredEvidence(text: string): string[] {
  const narrative = normalizeGroundedNarrative(text);
  const sections = narrative
    .split(/\n+/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean)
    .filter((part) => !/^https?:\/\//i.test(part));

  if (sections.length > 0) {
    return sections.slice(0, 5);
  }

  return buildEvidenceItems(text);
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
  const narrativeParagraphs = buildNarrativeParagraphs(groundedText);
  const evidenceItems = buildStructuredEvidence(groundedText);
  const extractedRecords = extractMarkdownRecords(groundedText);
  const explicitCitations = input.citations || [];
  const topRecords = extractedRecords
    .filter((record) => !explicitCitations.some((citation) => citation.url === record.url))
    .slice(0, 6);
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
    ".story-grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 12px; }",
    ".story-stack { display: grid; gap: 12px; }",
    ".panel { padding: 18px; border-radius: 20px; background: rgba(255,255,255,0.92); border: 1px solid rgba(148, 163, 184, 0.18); }",
    ".panel h2 { margin: 0 0 10px; font-size: 18px; letter-spacing: -0.02em; }",
    ".narrative { display: grid; gap: 10px; }",
    ".narrative p { margin: 0; color: var(--color-text-secondary); line-height: 1.65; }",
    ".evidence-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }",
    ".evidence-list li { position: relative; padding-left: 18px; line-height: 1.55; color: var(--color-text-secondary); }",
    ".evidence-list li::before { content: ''; position: absolute; left: 0; top: 0.65em; width: 8px; height: 8px; border-radius: 999px; background: var(--color-accent-soft); box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.2); }",
    ".summary-card { display: grid; gap: 12px; align-content: start; }",
    ".summary-kicker { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-text-muted); }",
    ".summary-copy { margin: 0; font-size: 14px; line-height: 1.6; color: var(--color-text-secondary); }",
    ".record-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }",
    ".record-item { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; padding: 12px 14px; border-radius: 16px; background: rgba(248,250,252,0.92); border: 1px solid rgba(148,163,184,0.16); }",
    ".record-label { font-weight: 600; color: var(--color-text); }",
    ".record-link { color: var(--color-accent); text-decoration: none; font-weight: 600; }",
    ".action { margin-top: 6px; display: inline-flex; padding: 10px 14px; border-radius: 999px; background: #0f172a; color: #fff; text-decoration: none; font-weight: 600; border: 0; cursor: pointer; }",
    ".action.secondary { background: rgba(37, 99, 235, 0.08); color: var(--color-accent); }",
    ".citation-list { display: grid; gap: 8px; margin-top: 12px; }",
    ".citation { color: #1d4ed8; text-decoration: none; font-weight: 600; }",
    "@media (max-width: 720px) { .story-grid { grid-template-columns: 1fr; } }",
    "</style>",
    `<div class="workspace">`,
    `<section class="hero"><div class="eyebrow">Dynamic Run</div><h1>${label}</h1><p>${escapeHtml(narrativeParagraphs[0] || normalizeWhitespace(groundedText))}</p></section>`,
    `<section class="story-grid"><section class="story-stack"><section class="panel"><h2>Grounded narrative</h2><div class="narrative">${narrativeParagraphs
      .map((item) => `<p>${escapeHtml(item)}</p>`)
      .join("")}</div></section><section class="panel"><h2>Evidence snapshot</h2><ul class="evidence-list">${evidenceItems
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("")}</ul></section>${topRecords.length > 0 ? `<section class="panel"><h2>Key records</h2><ul class="record-list">${topRecords
        .map(
          (record) =>
            `<li class="record-item"><span class="record-label">${escapeHtml(record.label)}</span><a class="record-link" href="${escapeHtml(record.url)}" target="_blank" rel="noreferrer">Open record</a></li>`
        )
        .join("")}</ul></section>` : ""}</section><section class="panel summary-card"><div class="summary-kicker">Next move</div><p class="summary-copy">Keep exploring the grounded result, inspect supporting sources, or ask the model to dig deeper on one thread.</p><button class="action" onclick="sendPrompt('${followUpPrompt}')">Go deeper</button><button class="action secondary" onclick="sendPrompt('Summarize the strongest supporting evidence for this result.')">Summarize evidence</button></section></section>`,
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

function validateWidgetCode(widgetCode: string, input?: WidgetGenerationInput): string | null {
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

  if (input) {
    const preferences = resolveVisualPreferences(input);
    const missingCssVars = preferences.requiredCssVars.filter((cssVar) => !normalized.includes(cssVar));
    if (missingCssVars.length > 0) {
      return `Widget code is missing required CSS variables: ${missingCssVars.slice(0, 6).join(", ")}`;
    }
  }

  return null;
}

function buildFallbackReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.trim()) {
    return "Widget generation was unavailable.";
  }

  return `The workspace kept the grounded answer intact while switching to a resilient fallback artifact because ${message.replace(/\.$/, "")}.`;
}

function parseProviderOrder(config: AppConfig): Array<StructuredGenerationProvider | "demo"> {
  const raw = String(config.widgetProviderOrder || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set<StructuredGenerationProvider | "demo">(["openai", "heroku", "demo"]);
  const ordered = raw.filter((value): value is StructuredGenerationProvider | "demo" =>
    allowed.has(value as StructuredGenerationProvider | "demo")
  );

  if (ordered.length === 0) {
    return ["heroku", "openai", "demo"];
  }

  if (!ordered.includes("demo")) {
    ordered.push("demo");
  }

  return [...new Set(ordered)];
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
  const normalized = String(text || "").trim();
  const withoutFences = normalized
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFences) as T;
  } catch {
    const firstBrace = withoutFences.indexOf("{");
    const lastBrace = withoutFences.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(withoutFences.slice(firstBrace, lastBrace + 1)) as T;
    }

    const firstBracket = withoutFences.indexOf("[");
    const lastBracket = withoutFences.lastIndexOf("]");
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      return JSON.parse(withoutFences.slice(firstBracket, lastBracket + 1)) as T;
    }

    throw new Error("Model output was not valid JSON.");
  }
}

async function callResponsesApi<T>(args: {
  config: AppConfig;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const payload = JSON.stringify({
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
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.config.openaiApiKey}`
      },
      body: payload
    });

    if (response.ok) {
      return parseStructuredResponse<T>(response, extractJson<T>);
    }

    const text = await response.text().catch(() => "");
    if (response.status === 429 && attempt < 2) {
      const retryAfterHeader = Number(response.headers.get("retry-after") || "");
      const retryAfterMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader * 1000 : 0;
      const backoffMs = retryAfterMs || (attempt + 1) * 1200;
      await sleep(backoffMs);
      continue;
    }

    throw new Error(`OpenAI Responses API failed (${response.status})${text ? `: ${text}` : ""}`);
  }

  throw new Error("OpenAI Responses API exhausted retries.");
}

async function callHerokuInference<T>(args: {
  config: AppConfig;
  system: string;
  user: string;
  fallbackParser: (text: string) => T;
}): Promise<T> {
  const apiKey = String(args.config.herokuInferenceKey || "").trim();
  if (!apiKey) {
    throw new Error("Heroku Inference is not configured.");
  }

  const requestUrl = buildHerokuChatBaseUrl(args.config.herokuInferenceUrl);
  const requestBody = JSON.stringify({
    model: args.config.herokuInferenceModel,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: `${args.user}\n\nReturn valid JSON only. Do not wrap it in markdown fences.` }
    ],
    temperature: 0.2
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: requestBody
    });

    if (response.ok) {
      const data = (await response.json()) as HerokuChatCompletionResponse;
      const outputText = extractChatCompletionText(data.choices?.[0]?.message?.content);
      if (!outputText) {
        throw new Error("Heroku Inference returned an empty response.");
      }
      return args.fallbackParser(outputText);
    }

    const text = await response.text().catch(() => "");
    if (response.status === 429 && attempt < 2) {
      const retryAfterHeader = Number(response.headers.get("retry-after") || "");
      const retryAfterMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader * 1000 : 0;
      const backoffMs = retryAfterMs || (attempt + 1) * 1200;
      await sleep(backoffMs);
      continue;
    }

    throw new Error(`Heroku Inference failed (${response.status})${text ? `: ${text}` : ""}`);
  }

  throw new Error("Heroku Inference exhausted retries.");
}

async function callStructuredGeneration<T>(args: {
  provider: StructuredGenerationProvider;
  config: AppConfig;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  if (args.provider === "openai") {
    return callResponsesApi<T>(args);
  }

  return callHerokuInference<T>({
    config: args.config,
    system: args.system,
    user: args.user,
    fallbackParser: extractJson<T>
  });
}

async function runStructuredWidgetEngine(
  provider: StructuredGenerationProvider,
  config: AppConfig,
  input: WidgetGenerationInput
): Promise<WidgetGenerationResult> {
  const query = input.query;
  const previewWidgetCode = buildWidgetPreviewHtml(query);
  const groundedText = String(input.groundedText || "").trim();
  const citations = input.citations || [];

  const visualize = await callStructuredGeneration<VisualizePlan>({
    provider,
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

  const widgetPlan = await callStructuredGeneration<WidgetPlan>({
    provider,
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
  const validationError = validateWidgetCode(widgetCode, input);

  if (validationError) {
    const repairedWidget = await callStructuredGeneration<WidgetPlan>({
      provider,
      config,
      system: REPAIR_SYSTEM_PROMPT,
      user: [
        `User query: ${query}`,
        `Validation error: ${validationError}`,
        groundedText ? `Grounded answer:\n${groundedText}` : "",
        buildVisualPreferencesPrompt(input),
        "Do not expose internal implementation names in visible labels, headings, captions, or legend text.",
        "Use business-facing chart and table titles that describe the data, not the rendering technique.",
        "Assume the artifact frame already gives you the outer shell; do not build a second full-page shell inside the widget.",
        "Keep the widget root visually quiet or transparent and reduce unnecessary nested framed wrappers.",
        "Do not render a full-bleed outer white or cream wrapper around the entire widget.",
        "Do not wrap the top insight in a large inset hero card unless separation is truly needed.",
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
    const repairedValidationError = validateWidgetCode(widgetCode, input);
    if (repairedValidationError) {
      throw new Error(`Repaired widget failed validation: ${repairedValidationError}`);
    }
    repaired = true;
  }

  return {
    provider,
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

  hasHerokuSupport(): boolean {
    return Boolean(String(this.config.herokuInferenceKey || "").trim());
  }

  private isProviderConfigured(provider: StructuredGenerationProvider): boolean {
    if (provider === "openai") {
      return this.hasOpenAiSupport();
    }

    return this.hasHerokuSupport();
  }

  buildPreview(query: string): string {
    return buildWidgetPreviewHtml(query);
  }

  async generate(input: WidgetGenerationInput): Promise<WidgetGenerationResult> {
    const providerOrder = parseProviderOrder(this.config);
    let lastError: unknown = null;

    for (const provider of providerOrder) {
      if (provider === "demo") {
        return runDemoWidgetEngine(
          input,
          lastError ? { fallbackReason: buildFallbackReason(lastError) } : undefined
        );
      }

      if (!this.isProviderConfigured(provider)) {
        lastError = new Error(`${provider} widget generation is not configured.`);
        continue;
      }

      try {
        return await runStructuredWidgetEngine(provider, this.config, input);
      } catch (error) {
        lastError = error;
        console.warn(`[widget-engine] ${provider} generation failed, trying next provider`, error);
      }
    }

    return runDemoWidgetEngine(input, {
      fallbackReason: "All configured widget providers were unavailable."
    });
  }
}
