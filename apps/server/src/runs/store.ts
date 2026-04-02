import type { StreamEvent, RunStatus } from "@chatgpt-mcp-dynamic/shared";

export type ActiveRun = {
  runId: string;
  query: string;
  status: RunStatus;
  events: StreamEvent[];
  subscribers: Set<(event: StreamEvent | null) => void>;
  createdAt: number;
};

const runs = new Map<string, ActiveRun>();

export function createRun(runId: string, query: string): ActiveRun {
  const run: ActiveRun = {
    runId,
    query,
    status: "running",
    events: [],
    subscribers: new Set(),
    createdAt: Date.now()
  };

  runs.set(runId, run);
  return run;
}

export function getRun(runId: string): ActiveRun | undefined {
  return runs.get(runId);
}

export function emitEvent(runId: string, event: StreamEvent): void {
  const run = runs.get(runId);
  if (!run) {
    return;
  }

  run.events.push(event);
  for (const subscriber of run.subscribers) {
    subscriber(event);
  }
}

export function completeRun(runId: string, status: Exclude<RunStatus, "running">): void {
  const run = runs.get(runId);
  if (!run) {
    return;
  }

  run.status = status;
  for (const subscriber of run.subscribers) {
    subscriber(null);
  }
  run.subscribers.clear();
}

export function subscribeToRun(
  runId: string,
  subscriber: (event: StreamEvent | null) => void
): (() => void) | null {
  const run = runs.get(runId);
  if (!run) {
    return null;
  }

  for (const event of run.events) {
    subscriber(event);
  }

  if (run.status !== "running") {
    subscriber(null);
    return () => {};
  }

  run.subscribers.add(subscriber);

  return () => {
    run.subscribers.delete(subscriber);
  };
}

