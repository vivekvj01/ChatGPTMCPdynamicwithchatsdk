import type { Express } from "express";
import type { StartDynamicRunInput } from "@chatgpt-mcp-dynamic/shared";
import type { AuthAdapter } from "../auth/adapter.js";
import type { RunOrchestrator } from "../services/run-orchestrator.js";
import { startDynamicRun } from "../services/start-dynamic-run.js";
import {
  buildDynamicRunWidgetResourceMeta,
  DYNAMIC_RUN_WIDGET_MIME_TYPE,
  DYNAMIC_RUN_WIDGET_URI,
  getDynamicRunWidgetHtml
} from "../widget/resource.js";
import { getConfig } from "../config.js";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function jsonRpcResult(id: JsonRpcRequest["id"], result: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  };
}

export function registerMcpRoute(
  app: Express,
  deps: {
    authAdapter: AuthAdapter;
    runOrchestrator: RunOrchestrator;
  }
): void {
  const config = getConfig();

  app.get("/mcp", (_req, res) => {
    res.json({
      ok: true,
      service: "chatgpt-mcp-dynamic",
      message: "POST JSON-RPC requests to this endpoint to access the MCP app server."
    });
  });

  app.post("/mcp", async (req, res) => {
    const body = (req.body || {}) as JsonRpcRequest;
    const method = String(body.method || "");

    try {
      if (method === "initialize") {
        res.json(
          jsonRpcResult(body.id, {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "chatgpt-mcp-dynamic",
              version: "0.1.0"
            },
            capabilities: {
              tools: {},
              resources: {}
            }
          })
        );
        return;
      }

      if (method === "notifications/initialized") {
        res.status(202).end();
        return;
      }

      if (method === "tools/list") {
        res.json(
          jsonRpcResult(body.id, {
            tools: [
              {
                name: "start_dynamic_run",
                title: "Start Dynamic Run",
                description: "Start a grounded run and open a live dynamic widget.",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: { type: "string" },
                    conversationKey: { type: "string" },
                    chatgptUsername: { type: "string" },
                    loginUrl: { type: "string" },
                    resetConversation: { type: "boolean" }
                  },
                  required: ["query"],
                  additionalProperties: false
                },
                _meta: {
                  ui: {
                    resourceUri: DYNAMIC_RUN_WIDGET_URI,
                    visibility: ["model", "app"]
                  },
                  "openai/outputTemplate": DYNAMIC_RUN_WIDGET_URI,
                  "openai/widgetAccessible": true,
                  "openai/toolInvocation/invoking": "Starting dynamic run…",
                  "openai/toolInvocation/invoked": "Dynamic run ready"
                }
              },
              {
                name: "connect_salesforce",
                title: "Connect Salesforce",
                description: "Return a reconnect URL when Salesforce auth is missing.",
                inputSchema: {
                  type: "object",
                  properties: {
                    chatgptUsername: { type: "string" },
                    loginUrl: { type: "string" }
                  },
                  additionalProperties: false
                },
                _meta: {
                  "openai/toolInvocation/invoking": "Checking connection…",
                  "openai/toolInvocation/invoked": "Connection status ready"
                }
              }
            ]
          })
        );
        return;
      }

      if (method === "resources/list") {
        res.json(
          jsonRpcResult(body.id, {
            resources: [
              {
                uri: DYNAMIC_RUN_WIDGET_URI,
                name: "dynamic-run-widget",
                title: "Dynamic Run Widget",
                description: "React-based streaming widget for ChatGPT dynamic runs.",
                mimeType: DYNAMIC_RUN_WIDGET_MIME_TYPE
              }
            ]
          })
        );
        return;
      }

      if (method === "resources/read") {
        const uri = String(body.params?.uri || "");
        if (uri !== DYNAMIC_RUN_WIDGET_URI) {
          res.status(404).json(jsonRpcError(body.id, -32002, `Unknown resource: ${uri}`));
          return;
        }

        res.json(
          jsonRpcResult(body.id, {
            contents: [
              {
                uri: DYNAMIC_RUN_WIDGET_URI,
                mimeType: DYNAMIC_RUN_WIDGET_MIME_TYPE,
                text: await getDynamicRunWidgetHtml(config),
                _meta: buildDynamicRunWidgetResourceMeta(config)
              }
            ]
          })
        );
        return;
      }

      if (method === "tools/call") {
        const name = String(body.params?.name || "");

        if (name === "start_dynamic_run") {
          const result = await startDynamicRun(
            (body.params?.arguments || {}) as StartDynamicRunInput,
            deps
          );

          res.json(
            jsonRpcResult(body.id, {
              content: [
                {
                  type: "text",
                  text: `Started dynamic run ${result.runId}.`
                }
              ],
              structuredContent: {
                ...result,
                widget: {
                  uri: "ui://widget/dynamic-run.html",
                  title: "Dynamic Run Workspace",
                  mode: "streaming"
                }
              },
              _meta: {
                ui: {
                  resourceUri: DYNAMIC_RUN_WIDGET_URI
                },
                "openai/outputTemplate": "ui://widget/dynamic-run.html",
                "openai/widgetAccessible": true,
                "openai/resultCanProduceWidget": true
              }
            })
          );
          return;
        }

        if (name === "connect_salesforce") {
          const connect = await deps.authAdapter.getConnectUrl(
            String((body.params?.arguments as Record<string, unknown> | undefined)?.chatgptUsername || ""),
            {
              loginUrl: String(
                (body.params?.arguments as Record<string, unknown> | undefined)?.loginUrl || ""
              )
            }
          );

          res.json(
            jsonRpcResult(body.id, {
              content: [
                {
                  type: "text",
                  text: connect.reconnectUrl
                    ? `Reconnect at ${connect.reconnectUrl}`
                    : "No reconnect URL available."
                }
              ],
              structuredContent: connect
            })
          );
          return;
        }

        res.status(404).json(jsonRpcError(body.id, -32601, `Unknown tool: ${name}`));
        return;
      }

      res.status(404).json(jsonRpcError(body.id, -32601, `Unknown method: ${method}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json(jsonRpcError(body.id, -32000, message));
    }
  });
}
