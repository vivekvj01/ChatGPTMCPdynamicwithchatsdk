import type { Express } from "express";

export function registerMcpRoute(app: Express): void {
  app.post("/mcp", (_req, res) => {
    res.status(501).json({
      error: "MCP route scaffolded but not implemented yet."
    });
  });
}

