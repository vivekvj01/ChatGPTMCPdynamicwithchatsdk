import { randomUUID } from "node:crypto";
import type { StartDynamicRunInput, StartDynamicRunResult } from "@chatgpt-mcp-dynamic/shared";
import { createRun } from "../runs/store.js";
import type { AuthAdapter } from "../auth/adapter.js";
import type { RunOrchestrator } from "./run-orchestrator.js";
import { getConfig } from "../config.js";

export async function startDynamicRun(
  input: StartDynamicRunInput,
  deps: {
    authAdapter: AuthAdapter;
    runOrchestrator: RunOrchestrator;
  }
): Promise<StartDynamicRunResult> {
  const config = getConfig();
  const query = String(input.query || "").trim();
  if (!query) {
    throw new Error("query is required");
  }

  const auth = await deps.authAdapter.getSharedSession(input.chatgptUsername || "", {
    loginUrl: input.loginUrl
  });
  const runId = `run_${randomUUID()}`;

  createRun(runId, query);
  deps.runOrchestrator.start(runId, input);

  return {
    runId,
    status: "started",
    connected: auth.connected,
    reconnectUrl: auth.reconnectUrl,
    apiBaseUrl: config.appBaseUrl,
    streamPath: `/api/runs/${runId}/stream`
  };
}
