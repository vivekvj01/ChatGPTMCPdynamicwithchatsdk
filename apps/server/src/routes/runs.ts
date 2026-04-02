import type { Express } from "express";
import type { RunSnapshotResult, StartDynamicRunInput } from "@chatgpt-mcp-dynamic/shared";
import { abortRun, getRun, subscribeToRun } from "../runs/store.js";
import type { AuthAdapter } from "../auth/adapter.js";
import type { RunOrchestrator } from "../services/run-orchestrator.js";
import { startDynamicRun } from "../services/start-dynamic-run.js";

export function registerRunRoutes(
  app: Express,
  deps: {
    authAdapter: AuthAdapter;
    runOrchestrator: RunOrchestrator;
  }
): void {
  app.use("/api/runs", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "X-Run-Active");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });

  app.post("/api/runs", async (req, res) => {
    try {
      const result = await startDynamicRun(req.body as StartDynamicRunInput, deps);
      res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.get("/api/runs/:runId/stream", (req, res) => {
    const runId = String(req.params.runId || "");
    const run = getRun(runId);

    if (!run) {
      res.status(404).json({ error: "run not found" });
      return;
    }

    if (run.status !== "running") {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Run-Active", "false");
      res.flushHeaders?.();
      res.write(": complete\n\n");
      res.end();
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Run-Active", "true");
    res.flushHeaders?.();

    const keepAlive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 15000);

    const unsubscribe = subscribeToRun(
      runId,
      (event) => {
        if (event === null) {
          clearInterval(keepAlive);
          res.end();
          return;
        }

        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
      { replay: true }
    );

    req.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe?.();
    });
  });

  app.post("/api/runs/:runId/cancel", (req, res) => {
    const runId = String(req.params.runId || "");
    abortRun(runId);
    res.json({ ok: true });
  });

  app.get("/api/runs/:runId/snapshot", (req, res) => {
    const runId = String(req.params.runId || "");
    const run = getRun(runId);

    if (!run) {
      res.status(404).json({ error: "run not found" });
      return;
    }

    const payload: RunSnapshotResult = {
      runId: run.runId,
      status: run.status,
      events: run.events
    };

    res.json(payload);
  });
}
