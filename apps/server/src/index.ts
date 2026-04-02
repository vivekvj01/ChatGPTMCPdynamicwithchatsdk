import path from "node:path";
import express from "express";
import { getConfig } from "./config.js";
import { registerMcpRoute } from "./mcp/server.js";
import { AuthAdapter } from "./auth/adapter.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerRunRoutes } from "./routes/runs.js";
import { RunOrchestrator } from "./services/run-orchestrator.js";
import { WidgetEngine } from "./services/widget-engine.js";

const widgetDistDir = path.resolve(process.cwd(), "apps/widget/dist");
const config = getConfig();
const app = express();
const authAdapter = new AuthAdapter(config);
const widgetEngine = new WidgetEngine(config);
const runOrchestrator = new RunOrchestrator(authAdapter, widgetEngine);

app.use(express.json({ limit: "1mb" }));
app.use("/widget-assets", express.static(widgetDistDir));

registerHealthRoutes(app);
registerRunRoutes(app, { authAdapter, runOrchestrator });
registerMcpRoute(app, { authAdapter, runOrchestrator });

app.listen(config.port, () => {
  console.log(`server listening on :${config.port}`);
});
