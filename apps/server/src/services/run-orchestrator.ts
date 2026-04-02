import { createStreamEvent, type StartDynamicRunInput } from "@chatgpt-mcp-dynamic/shared";
import { completeRun, emitEvent, getRun } from "../runs/store.js";
import type { AuthAdapter } from "../auth/adapter.js";
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
    private readonly widgetEngine: WidgetEngine
  ) {}

  start(runId: string, input: StartDynamicRunInput): void {
    void this.execute(runId, input);
  }

  private async execute(runId: string, input: StartDynamicRunInput): Promise<void> {
    const reasoningId = `${runId}_reasoning`;
    const textId = `${runId}_text`;
    const visualizeToolCallId = `${runId}_visualize`;
    const messageToolCallId = `${runId}_message`;
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

      if (!auth.connected) {
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
          createStreamEvent("tool-output-error", runId, {
            toolCallId: "connect_salesforce",
            errorText: auth.reconnectUrl || "Authentication required."
          })
        );
        emitEvent(
          runId,
          createStreamEvent("run-complete", runId, {
            status: "completed",
            authRequired: true,
            reconnectUrl: auth.reconnectUrl
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
          toolCallId: messageToolCallId,
          toolName: "message_endpoint"
        })
      );
      emitEvent(
        runId,
        createStreamEvent("tool-input-available", runId, {
          toolCallId: messageToolCallId,
          toolName: "message_endpoint",
          input: {
            query: input.query,
            conversationKey: input.conversationKey || runId
          }
        })
      );

      emitEvent(
        runId,
        createStreamEvent("reasoning-delta", runId, {
          id: reasoningId,
          delta: "Running shared auth service agent query.\n"
        })
      );

      const grounded = await this.authAdapter.runSharedAgentQuery(
        input.chatgptUsername || "",
        input.conversationKey || runId,
        input.query,
        { loginUrl: input.loginUrl }
      );

      if (signal.aborted) {
        completeRun(runId, "aborted");
        return;
      }

      emitEvent(
        runId,
        createStreamEvent("tool-output-available", runId, {
          toolCallId: messageToolCallId,
          toolName: "message_endpoint",
          output: {
            mode: grounded.mode,
            unsupported: grounded.unsupported,
            summary: grounded.summary,
            citations: grounded.citations
          }
        })
      );

      emitEvent(
        runId,
        createStreamEvent("reasoning-delta", runId, {
          id: reasoningId,
          delta: grounded.unsupported
            ? "Shared auth service query endpoint is unsupported in this environment. Falling back to local summary.\n"
            : `Grounded result received via ${grounded.mode}.\n`
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
      emitEvent(runId, createStreamEvent("text-start", runId, { id: textId }));
      for (const chunk of chunkText(widget.assistantText)) {
        if (signal.aborted) {
          completeRun(runId, "aborted");
          return;
        }
        emitEvent(runId, createStreamEvent("text-delta", runId, { id: textId, delta: chunk }));
        await sleep(60);
      }
      emitEvent(runId, createStreamEvent("text-end", runId, { id: textId }));

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
            citations: grounded.citations
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
