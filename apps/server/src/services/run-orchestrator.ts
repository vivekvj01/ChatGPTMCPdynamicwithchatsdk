import { createStreamEvent, type StartDynamicRunInput } from "@chatgpt-mcp-dynamic/shared";
import { completeRun, emitEvent, getRun } from "../runs/store.js";
import type { AuthAdapter } from "../auth/adapter.js";
import type { DirectAgentforceService } from "./direct-agentforce.js";
import type { WidgetEngine } from "./widget-engine.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function chunkText(text: string, chunkSize = 48): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks.length > 0 ? chunks : [text];
}

function ensureRunning(runId: string): AbortSignal {
  const run = getRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found.`);
  }
  return run.abortController.signal;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export class RunOrchestrator {
  constructor(
    private readonly authAdapter: AuthAdapter,
    private readonly directAgentforce: DirectAgentforceService,
    private readonly widgetEngine: WidgetEngine
  ) {}

  start(runId: string, input: StartDynamicRunInput): void {
    void this.execute(runId, input);
  }

  private async execute(runId: string, input: StartDynamicRunInput): Promise<void> {
    const reasoningId = `${runId}_reasoning`;
    const textId = `${runId}_text`;
    const visualizeToolCallId = `${runId}_visualize`;
    const searchToolCallId = `${runId}_search`;
    const toolCallId = `${runId}_widget`;
    const signal = ensureRunning(runId);

    emitEvent(runId, createStreamEvent("run-start", runId, { query: input.query }));
    emitEvent(runId, createStreamEvent("reasoning-start", runId, { id: reasoningId }));
    emitEvent(
      runId,
      createStreamEvent("reasoning-delta", runId, {
        id: reasoningId,
        delta: "Checking Salesforce connection.\n"
      })
    );

    try {
      if (signal.aborted) {
        completeRun(runId, "aborted");
        return;
      }

      const auth = await this.authAdapter.getSharedSession(input.chatgptUsername || "", {
        loginUrl: input.loginUrl
      });

      if (!auth.connected || (!auth.session && auth.mode !== "demo")) {
        let reconnectUrl = auth.reconnectUrl;
        if (!reconnectUrl) {
          try {
            const reconnect = await this.authAdapter.getConnectUrl(input.chatgptUsername || "", {
              loginUrl: input.loginUrl
            });
            reconnectUrl = reconnect.reconnectUrl;
          } catch (connectError) {
            const connectMessage =
              connectError instanceof Error ? connectError.message : String(connectError);
            emitEvent(
              runId,
              createStreamEvent("reasoning-delta", runId, {
                id: reasoningId,
                delta: `Reconnect URL lookup failed: ${connectMessage}\n`
              })
            );
          }
        }

        emitEvent(
          runId,
          createStreamEvent("reasoning-delta", runId, {
            id: reasoningId,
            delta: "Connection missing. Returning reconnect state.\n"
          })
        );
        emitEvent(runId, createStreamEvent("reasoning-end", runId, { id: reasoningId }));
        emitEvent(runId, createStreamEvent("text-start", runId, { id: textId }));
        emitEvent(
          runId,
          createStreamEvent("text-delta", runId, {
            id: textId,
            delta: "Salesforce authentication is required before the run can continue."
          })
        );
        emitEvent(runId, createStreamEvent("text-end", runId, { id: textId }));
        emitEvent(
          runId,
          createStreamEvent("tool-output-available", runId, {
            toolCallId: "connect_salesforce",
            toolName: "connect_salesforce",
            output: {
              reconnectUrl,
              connected: false
            }
          })
        );
        emitEvent(
          runId,
          createStreamEvent("tool-output-error", runId, {
            toolCallId: "connect_salesforce",
            errorText: reconnectUrl || "Authentication required."
          })
        );
        emitEvent(
          runId,
          createStreamEvent("run-complete", runId, {
            status: "completed",
            authRequired: true,
            reconnectUrl
          })
        );
        completeRun(runId, "completed");
        return;
      }

      emitEvent(
        runId,
        createStreamEvent("reasoning-delta", runId, {
          id: reasoningId,
          delta: `Connection ready via ${auth.mode}.\n`
        })
      );
      emitEvent(
        runId,
        createStreamEvent("tool-input-start", runId, {
          toolCallId: searchToolCallId,
          toolName: "search_agent"
        })
      );
      emitEvent(
        runId,
        createStreamEvent("tool-input-available", runId, {
          toolCallId: searchToolCallId,
          toolName: "search_agent",
          input: {
            query: input.query,
            conversationKey: input.conversationKey || runId,
            transport: "direct-agentforce-stream"
          }
        })
      );
      emitEvent(
        runId,
        createStreamEvent("reasoning-delta", runId, {
          id: reasoningId,
          delta: "Opening direct Agentforce grounded search stream.\n"
        })
      );
      emitEvent(runId, createStreamEvent("text-start", runId, { id: textId }));

      let streamedText = "";
      const grounded = await this.directAgentforce.runSearch({
        session: auth.session,
        query: input.query,
        signal,
        onEvent: (event) => {
          if (signal.aborted) {
            return;
          }

          switch (event.type) {
            case "progress":
              emitEvent(
                runId,
                createStreamEvent("reasoning-delta", runId, {
                  id: reasoningId,
                  delta: `${event.message}\n`
                })
              );
              break;
            case "text-chunk":
              if (event.text) {
                streamedText += event.text;
                emitEvent(
                  runId,
                  createStreamEvent("text-delta", runId, {
                    id: textId,
                    delta: event.text
                  })
                );
              }
              break;
            case "inform":
              emitEvent(
                runId,
                createStreamEvent("reasoning-delta", runId, {
                  id: reasoningId,
                  delta:
                    event.citations.length > 0
                      ? `Search Agent returned ${event.citations.length} citation${event.citations.length === 1 ? "" : "s"}.\n`
                      : "Search Agent returned a grounded answer.\n"
                })
              );
              break;
            case "validation-failure":
              emitEvent(
                runId,
                createStreamEvent("reasoning-delta", runId, {
                  id: reasoningId,
                  delta: `Search Agent validation warning: ${event.message}\n`
                })
              );
              break;
            case "end":
              emitEvent(
                runId,
                createStreamEvent("reasoning-delta", runId, {
                  id: reasoningId,
                  delta: "Direct Agentforce stream completed.\n"
                })
              );
              break;
            default:
              break;
          }
        }
      });

      if (signal.aborted) {
        completeRun(runId, "aborted");
        return;
      }

      if (!streamedText.trim() && grounded.text.trim()) {
        for (const chunk of chunkText(grounded.text)) {
          if (signal.aborted) {
            completeRun(runId, "aborted");
            return;
          }
          emitEvent(runId, createStreamEvent("text-delta", runId, { id: textId, delta: chunk }));
          await sleep(40);
        }
      }
      emitEvent(runId, createStreamEvent("text-end", runId, { id: textId }));

      emitEvent(
        runId,
        createStreamEvent("tool-output-available", runId, {
          toolCallId: searchToolCallId,
          toolName: "search_agent",
          output: {
            mode: grounded.mode,
            summary: grounded.summary,
            citations: grounded.citations
          }
        })
      );

      emitEvent(
        runId,
        createStreamEvent("reasoning-delta", runId, {
          id: reasoningId,
          delta:
            grounded.mode === "direct-agentforce"
              ? "Grounded result received from the direct Agentforce stream.\n"
              : "Direct Agentforce config is unavailable in this environment, so the run is using demo grounding.\n"
        })
      );

      await sleep(150);
      emitEvent(
        runId,
        createStreamEvent("reasoning-delta", runId, {
          id: reasoningId,
          delta: this.widgetEngine.hasOpenAiSupport()
            ? "Starting widget engine using OpenAI Responses API.\n"
            : "Starting widget engine using demo provider.\n"
        })
      );
      emitEvent(
        runId,
        createStreamEvent("tool-input-start", runId, {
          toolCallId: visualizeToolCallId,
          toolName: "visualize_read_me"
        })
      );
      emitEvent(
        runId,
        createStreamEvent("tool-input-available", runId, {
          toolCallId: visualizeToolCallId,
          toolName: "visualize_read_me",
          input: {
            query: input.query,
            groundedSummary: grounded.summary
          }
        })
      );
      emitEvent(
        runId,
        createStreamEvent("tool-input-start", runId, {
          toolCallId,
          toolName: "show_widget"
        })
      );
      emitEvent(
        runId,
        createStreamEvent("tool-input-available", runId, {
          toolCallId,
          toolName: "show_widget",
          input: { title: "dynamic_run_preview" }
        })
      );
      emitEvent(
        runId,
        createStreamEvent("tool-output-available", runId, {
          toolCallId,
          toolName: "show_widget",
          output: {
            title: "dynamic_run_preview",
            widget_code: this.widgetEngine.buildPreview(input.query),
            complete: false
          }
        })
      );

      const widget = await this.widgetEngine.generate({
        query: input.query,
        groundedText: grounded.text,
        citations: grounded.citations,
        upstreamMode: grounded.mode
      });

      if (signal.aborted) {
        completeRun(runId, "aborted");
        return;
      }

      emitEvent(
        runId,
        createStreamEvent("tool-output-available", runId, {
          toolCallId: visualizeToolCallId,
          toolName: "visualize_read_me",
          output: {
            modules: widget.modules,
            provider: widget.provider
          }
        })
      );
      for (const phase of widget.phases) {
        emitEvent(
          runId,
          createStreamEvent("reasoning-delta", runId, {
            id: reasoningId,
            delta: `${phase.name}: ${phase.detail}\n`
          })
        );
      }
      emitEvent(
        runId,
        createStreamEvent("tool-output-available", runId, {
          toolCallId,
          toolName: "show_widget",
          output: {
            title: widget.previewTitle,
            widget_code: widget.previewWidgetCode,
            complete: false,
            provider: widget.provider,
            modules: widget.modules
          }
        })
      );

      await sleep(150);
      emitEvent(runId, createStreamEvent("reasoning-end", runId, { id: reasoningId }));

      emitEvent(
        runId,
        createStreamEvent("tool-output-available", runId, {
          toolCallId,
          toolName: "show_widget",
          output: {
            title: widget.title,
            widget_code: widget.widgetCode,
            complete: true,
            provider: widget.provider,
            repaired: widget.repaired,
            modules: widget.modules,
            citations: grounded.citations,
            groundedMode: grounded.mode,
            assistantText: widget.assistantText
          }
        })
      );
      emitEvent(
        runId,
        createStreamEvent("run-complete", runId, {
          status: "completed",
          authRequired: false
        })
      );
      completeRun(runId, "completed");
    } catch (error) {
      if (isAbortError(error)) {
        completeRun(runId, "aborted");
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      emitEvent(runId, createStreamEvent("run-error", runId, { message }));
      completeRun(runId, "error");
    }
  }
}
