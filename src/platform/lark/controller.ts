import * as Lark from "@larksuiteoapi/node-sdk";
import type { Logger } from "pino";
import type { AppConfig } from "../../app/config.js";
import type { AgentBridgeService } from "../../services/agent-bridge-service.js";
import { LarkClient } from "./client.js";
import { createLarkMessageHandler } from "./handlers.js";

export function createLarkController(
  config: AppConfig,
  logger: Logger,
  agentBridgeService: AgentBridgeService
) {
  const larkConfig = config.lark;
  if (!larkConfig) {
    throw new Error("Lark is not configured");
  }

  const client = new LarkClient({
    appId: larkConfig.appId,
    appSecret: larkConfig.appSecret
  });
  const messageHandler = createLarkMessageHandler({
    allowedUserId: larkConfig.allowedUserId,
    agentBridgeService,
    client,
    logger
  });

  const wsClient = new Lark.WSClient({
    appId: larkConfig.appId,
    appSecret: larkConfig.appSecret
  });

  const eventDispatcher = new Lark.EventDispatcher({
    ...(larkConfig.encryptKey ? { encryptKey: larkConfig.encryptKey } : {}),
    ...(larkConfig.verificationToken ? { verificationToken: larkConfig.verificationToken } : {})
  }).register({
    "im.message.receive_v1": async (data: unknown) => {
      logger.info("Received Lark im.message.receive_v1 event");
      await messageHandler(data as any);
    }
  });

  let started = false;

  return {
    async start() {
      if (started) {
        return;
      }

      await wsClient.start({
        eventDispatcher
      });
      started = true;
      logger.info("Lark long connection started");
    },
    async stop() {
      if (!started) {
        return;
      }

      wsClient.close();
      started = false;
    }
  };
}
