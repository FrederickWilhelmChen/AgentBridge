import path from "node:path";
import { loadConfig } from "./config.js";
import { ConnectionHealthMonitor } from "./connection-health.js";
import { createLogger } from "./logger.js";
import { createSlackApp } from "../slack/controller.js";
import { createLarkController } from "../platform/lark/controller.js";
import { createDatabase } from "../store/db.js";
import { SessionStore } from "../store/session-store.js";
import { RunStore } from "../store/run-store.js";
import { InboundMessageStore } from "../store/inbound-message-store.js";
import { WorkspaceStore } from "../store/workspace-store.js";
import { ExecutionContextStore } from "../store/execution-context-store.js";
import { SessionService } from "../services/session-service.js";
import { WorkspaceDiscoveryService } from "../services/workspace-discovery-service.js";
import { ProcessManager } from "../runtime/process-manager.js";
import { ImageCache } from "../runtime/image-cache.js";
import { AgentBridgeService } from "../services/agent-bridge-service.js";

async function main() {
  const config = loadConfig();
  const logger = createLogger();
  const healthMonitor = new ConnectionHealthMonitor(logger);
  const database = createDatabase(config.database.path);

  const sessionStore = new SessionStore(database);
  const runStore = new RunStore(database);
  const inboundMessageStore = new InboundMessageStore(database);
  const workspaceStore = new WorkspaceStore(database);
  const executionContextStore = new ExecutionContextStore(database);

  const sessionService = new SessionService(
    sessionStore,
    runStore,
    workspaceStore,
    executionContextStore
  );
  const workspaceDiscoveryService = new WorkspaceDiscoveryService(sessionService);
  const processManager = new ProcessManager(logger, {
    httpProxy: config.runtime.httpProxy,
    httpsProxy: config.runtime.httpsProxy
  });
  const imageCache = new ImageCache({
    cacheDir: path.join(path.dirname(config.database.path), ".image-cache")
  });
  const agentBridgeService = new AgentBridgeService(config, sessionService, processManager);
  const cleanupTasks: Array<() => Promise<void> | void> = [];
  await imageCache.cleanupExpiredFiles();
  const imageCleanupTimer = setInterval(async () => {
    try {
      const removedCount = await imageCache.cleanupExpiredFiles();
      if (removedCount > 0) {
        logger.info({ removedCount }, "Expired cached images removed");
      }
    } catch (error) {
      logger.warn({ error }, "Failed to clean up expired cached images");
    }
  }, 60 * 60 * 1000);
  imageCleanupTimer.unref?.();
  healthMonitor.start();
  cleanupTasks.push(() => {
    healthMonitor.stop();
  });
  cleanupTasks.push(() => {
    clearInterval(imageCleanupTimer);
  });

  const discoveryResult = config.runtime.workspace
    ? workspaceDiscoveryService.refresh(config.runtime.workspace)
    : { workspaces: [] };

  logger.info(
    {
      dbPath: config.database.path,
      enabledPlatforms: config.runtime.enabledPlatforms,
      allowedCwds: config.runtime.allowedCwds,
      workspaceParents: config.runtime.workspace?.allowedWorkspaceParents ?? [],
      manualWorkspaces: config.runtime.workspace?.manualWorkspaces ?? [],
      discoveredWorkspaceCount: discoveryResult.workspaces.length,
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

    const app = createSlackApp(config, logger, agentBridgeService, {
      imageCache,
      messageDeduper: inboundMessageStore,
      onConnected: () => healthMonitor.markConnected("slack"),
      onEventReceived: () => healthMonitor.markEvent("slack")
    });
    await app.start();
    cleanupTasks.push(async () => {
      await app.stop();
    });
    logger.info("Slack app started");
  }

  if (config.runtime.enabledPlatforms.includes("lark")) {
    const larkController = createLarkController(config, logger, agentBridgeService, {
      imageCache,
      messageDeduper: inboundMessageStore,
      onConnected: () => healthMonitor.markConnected("lark"),
      onEventReceived: () => healthMonitor.markEvent("lark")
    });
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
