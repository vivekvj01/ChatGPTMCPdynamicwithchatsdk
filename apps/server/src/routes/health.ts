import type { Express } from "express";

export function registerHealthRoutes(app: Express): void {
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });
}

