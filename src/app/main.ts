import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createSlackApp } from "../slack/controller.js";
import { createLarkController } from "../platform/lark/controller.js";
import { createDatabase } from "../store/db.js";
import { SessionStore } from "../store/session-store.js";
import { RunStore } from "../store/run-store.js";
import { SessionService } from "../services/session-service.js";
import { ProcessManager } from "../runtime/process-manager.js";
import { AgentBridgeService } from "../services/agent-bridge-service.js";

async function main() {
  const config = loadConfig();
  const logger = createLogger();
  const database = createDatabase(config.database.path);

  const sessionStore = new SessionStore(database);
  const runStore = new RunStore(database);

  const sessionService = new SessionService(sessionStore, runStore);
  const processManager = new ProcessManager(logger, {
    httpProxy: config.runtime.httpProxy,
    httpsProxy: config.runtime.httpsProxy
  });
  const agentBridgeService = new AgentBridgeService(config, sessionService, processManager);
  const cleanupTasks: Array<() => Promise<void> | void> = [];

  logger.info(
    {
      dbPath: config.database.path,
      enabledPlatforms: config.runtime.enabledPlatforms,
      allowedCwds: config.runtime.allowedCwds,
      defaultAgent: config.runtime.defaultAgent,
      httpProxy: config.runtime.httpProxy,
      httpsProxy: config.runtime.httpsProxy
    },
    "AgentBridge bootstrapped"
  );

  registerShutdownHandlers({
    logger,
    processManager,
    cleanupTasks
  });

  if (config.runtime.enabledPlatforms.includes("slack")) {
    if (!config.slack) {
      throw new Error("Slack is enabled but not configured");
    }

    const app = createSlackApp(config, logger, agentBridgeService);
    await app.start();
    cleanupTasks.push(async () => {
      await app.stop();
    });
    logger.info("Slack app started");
  }

  if (config.runtime.enabledPlatforms.includes("lark")) {
    const larkController = createLarkController(config, logger, agentBridgeService);
    await larkController.start();
    cleanupTasks.push(() => larkController.stop());
  }
}

main().catch((error) => {
  // Keep bootstrap failure readable before structured logging is fully available.
  console.error(error);
  process.exitCode = 1;
});

function registerShutdownHandlers(args: {
  logger: ReturnType<typeof createLogger>;
  processManager: ProcessManager;
  cleanupTasks: Array<() => Promise<void> | void>;
}) {
  let shuttingDown = false;

  const handleShutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    args.logger.info({ signal }, "Shutting down AgentBridge");
    args.processManager.shutdown();
    for (const cleanup of args.cleanupTasks) {
      await cleanup();
    }
    process.exit(0);
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
}
