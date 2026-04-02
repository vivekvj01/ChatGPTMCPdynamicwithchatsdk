export type RunStatus = "running" | "completed" | "error" | "aborted";

export type StreamEvent = {
  type: string;
  runId: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

