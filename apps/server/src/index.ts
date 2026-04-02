import express from "express";
import { getConfig } from "./config.js";
import { registerMcpRoute } from "./mcp/server.js";
import { AuthAdapter } from "./auth/adapter.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerRunRoutes } from "./routes/runs.js";
import { DirectAgentforceService } from "./services/direct-agentforce.js";
import { RunOrchestrator } from "./services/run-orchestrator.js";
import { WidgetEngine } from "./services/widget-engine.js";
import { setupOAuth } from "./oauth.js";
import { resolveWidgetDistDir } from "./paths.js";

const widgetDistDir = resolveWidgetDistDir(import.meta.url);
const config = getConfig();
const app = express();
app.set("trust proxy", 1);
const authAdapter = new AuthAdapter(config);
const widgetEngine = new WidgetEngine(config);
const directAgentforce = new DirectAgentforceService(config);
const runOrchestrator = new RunOrchestrator(authAdapter, directAgentforce, widgetEngine);
const oauth = config.appBaseUrl
  ? setupOAuth(app, new URL(config.appBaseUrl), {
      signingSecret: config.salesforceAuthServiceSecret
    })
  : null;

app.use(express.json({ limit: "1mb" }));
app.use("/widget-assets", express.static(widgetDistDir));

registerHealthRoutes(app);
registerRunRoutes(app, { authAdapter, runOrchestrator });
registerMcpRoute(app, { authAdapter, runOrchestrator, oauth });

app.listen(config.port, () => {
  console.log(`server listening on :${config.port}`);
});
