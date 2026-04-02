export type RunStatus = "running" | "completed" | "error" | "aborted";

export type StreamEventType =
  | "run-start"
  | "reasoning-start"
  | "reasoning-delta"
  | "reasoning-end"
  | "text-start"
  | "text-delta"
  | "text-end"
  | "tool-input-start"
  | "tool-input-available"
  | "tool-output-available"
  | "tool-output-error"
  | "run-complete"
  | "run-error";

export type StreamEvent = {
  type: StreamEventType;
  runId: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

export type Citation = {
  label: string;
  url: string;
};

export type StartDynamicRunInput = {
  query: string;
  conversationKey?: string;
  chatgptUsername?: string;
  loginUrl?: string;
  resetConversation?: boolean;
};

export type StartDynamicRunResult = {
  runId: string;
  status: "started";
  connected: boolean;
  reconnectUrl: string | null;
  streamPath?: string;
};

export type RunSnapshotResult = {
  runId: string;
  status: RunStatus;
  events: StreamEvent[];
};

export function createStreamEvent(
  type: StreamEventType,
  runId: string,
  payload: Record<string, unknown>
): StreamEvent {
  return {
    type,
    runId,
    timestamp: new Date().toISOString(),
    payload
  };
}
