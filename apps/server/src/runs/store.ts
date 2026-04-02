import type { StreamEvent, RunStatus } from "@chatgpt-mcp-dynamic/shared";

export type ActiveRun = {
  runId: string;
  query: string;
  status: RunStatus;
  events: StreamEvent[];
  subscribers: Set<(event: StreamEvent | null) => void>;
  createdAt: number;
  completedAt?: number;
  abortController: AbortController;
  expiresAt?: number;
  cleanupTimer?: ReturnType<typeof setTimeout>;
};

const runs = new Map<string, ActiveRun>();
const RUN_TTL_MS = 10 * 60 * 1000;

function scheduleCleanup(run: ActiveRun): void {
  if (run.cleanupTimer) {
    clearTimeout(run.cleanupTimer);
  }

  run.expiresAt = Date.now() + RUN_TTL_MS;
  run.cleanupTimer = setTimeout(() => {
    runs.delete(run.runId);
  }, RUN_TTL_MS);
}

export function createRun(runId: string, query: string): ActiveRun {
  const run: ActiveRun = {
    runId,
    query,
    status: "running",
    events: [],
    subscribers: new Set(),
    createdAt: Date.now(),
    abortController: new AbortController()
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

  if (run.status !== "running") {
    return;
  }

  run.status = status;
  run.completedAt = Date.now();
  run.abortController.abort();
  for (const subscriber of run.subscribers) {
    subscriber(null);
  }
  run.subscribers.clear();
  scheduleCleanup(run);
}

export function abortRun(runId: string): void {
  completeRun(runId, "aborted");
}

export function subscribeToRun(
  runId: string,
  subscriber: (event: StreamEvent | null) => void,
  options: { replay?: boolean } = {}
): (() => void) | null {
  const run = runs.get(runId);
  if (!run) {
    return null;
  }

  if (options.replay ?? true) {
    for (const event of run.events) {
      subscriber(event);
    }
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
