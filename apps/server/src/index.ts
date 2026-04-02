import express from "express";
import { getConfig } from "./config.js";
import { registerMcpRoute } from "./mcp/server.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerRunRoutes } from "./routes/runs.js";

const config = getConfig();
const app = express();

app.use(express.json({ limit: "1mb" }));

registerHealthRoutes(app);
registerRunRoutes(app);
registerMcpRoute(app);

app.listen(config.port, () => {
  console.log(`server listening on :${config.port}`);
});

