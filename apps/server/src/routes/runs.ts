import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { completeRun, createRun, emitEvent, getRun, subscribeToRun } from "../runs/store.js";

export function registerRunRoutes(app: Express): void {
  app.post("/api/runs", (req, res) => {
    const query = String(req.body?.query || "").trim();
    if (!query) {
      res.status(400).json({ error: "query is required" });
      return;
    }

    const runId = `run_${randomUUID()}`;
    createRun(runId, query);

    emitEvent(runId, {
      type: "run-start",
      runId,
      timestamp: new Date().toISOString(),
      payload: { query }
    });

    emitEvent(runId, {
      type: "reasoning-delta",
      runId,
      timestamp: new Date().toISOString(),
      payload: {
        id: "reasoning_1",
        delta: "Scaffold run created.\n"
      }
    });

    res.status(201).json({
      runId,
      status: "started",
      connected: false,
      reconnectUrl: null
    });
  });

  app.get("/api/runs/:runId/stream", (req, res) => {
    const runId = String(req.params.runId || "");
    const run = getRun(runId);

    if (!run) {
      res.status(404).json({ error: "run not found" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const unsubscribe = subscribeToRun(runId, (event) => {
      if (event === null) {
        res.end();
        return;
      }

      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on("close", () => {
      unsubscribe?.();
    });
  });

  app.post("/api/runs/:runId/cancel", (req, res) => {
    const runId = String(req.params.runId || "");
    completeRun(runId, "aborted");
    res.json({ ok: true });
  });

  app.get("/api/runs/:runId/snapshot", (req, res) => {
    const runId = String(req.params.runId || "");
    const run = getRun(runId);

    if (!run) {
      res.status(404).json({ error: "run not found" });
      return;
    }

    res.json({
      runId: run.runId,
      status: run.status,
      events: run.events
    });
  });
}

