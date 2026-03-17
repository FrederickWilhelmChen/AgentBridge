import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createSlackApp } from "../slack/controller.js";
import { createDatabase } from "../store/db.js";
import { SessionStore } from "../store/session-store.js";
import { RunStore } from "../store/run-store.js";
import { SessionService } from "../services/session-service.js";
import { ActionRouter } from "../services/router.js";
import { ProcessManager } from "../runtime/process-manager.js";
import { AgentBridgeService } from "../services/agent-bridge-service.js";

async function main() {
  const config = loadConfig();
  const logger = createLogger();
  const database = createDatabase(config.database.path);

  const sessionStore = new SessionStore(database);
  const runStore = new RunStore(database);

  const sessionService = new SessionService(sessionStore, runStore);
  const actionRouter = new ActionRouter();
  const processManager = new ProcessManager(logger, {
    httpProxy: config.runtime.httpProxy,
    httpsProxy: config.runtime.httpsProxy
  });
  const agentBridgeService = new AgentBridgeService(config, sessionService, processManager);

  const app = createSlackApp(config, logger, agentBridgeService);

  logger.info(
    {
      dbPath: config.database.path,
      allowedCwds: config.runtime.allowedCwds,
      defaultAgent: config.runtime.defaultAgent,
      httpProxy: config.runtime.httpProxy,
      httpsProxy: config.runtime.httpsProxy
    },
    "AgentBridge bootstrapped"
  );

  void sessionService;
  void actionRouter;
  void processManager;
  void agentBridgeService;

  await app.start();
  logger.info("Slack app started");
}

main().catch((error) => {
  // Keep bootstrap failure readable before structured logging is fully available.
  console.error(error);
  process.exitCode = 1;
});
