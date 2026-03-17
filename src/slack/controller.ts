import { App } from "@slack/bolt";
import type { Logger } from "pino";
import type { AppConfig } from "../app/config.js";
import type { AgentBridgeService } from "../services/agent-bridge-service.js";
import { registerSlackHandlers } from "./handlers.js";

export function createSlackApp(
  config: AppConfig,
  logger: Logger,
  agentBridgeService: AgentBridgeService
) {
  const app = new App({
    token: config.slack.botToken,
    signingSecret: config.slack.signingSecret,
    socketMode: true,
    appToken: config.slack.appToken
  });

  registerSlackHandlers(app, {
    allowedUserId: config.slack.allowedUserId,
    logger,
    config,
    agentBridgeService
  });

  return app;
}
