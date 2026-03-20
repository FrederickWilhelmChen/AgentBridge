import * as Lark from "@larksuiteoapi/node-sdk";
import type { Logger } from "pino";
import type { AppConfig } from "../../app/config.js";
import type { ImageCache } from "../../runtime/image-cache.js";
import type { AgentBridgeService } from "../../services/agent-bridge-service.js";
import type { InboundMessageStore } from "../../store/inbound-message-store.js";
import { LarkClient } from "./client.js";
import { createLarkMessageHandler } from "./handlers.js";

export function createLarkController(
  config: AppConfig,
  logger: Logger,
  agentBridgeService: AgentBridgeService,
  options?: {
    imageCache?: ImageCache;
    messageDeduper?: InboundMessageStore;
    onConnected?: () => void;
    onEventReceived?: () => void;
  }
) {
  const larkConfig = config.lark;
  if (!larkConfig) {
    throw new Error("Lark is not configured");
  }

  const client = new LarkClient({
    appId: larkConfig.appId,
    appSecret: larkConfig.appSecret,
    proxyUrl: config.runtime.httpsProxy ?? config.runtime.httpProxy
  });
  const messageHandler = createLarkMessageHandler({
    allowedUserId: larkConfig.allowedUserId,
    allowedCwds: config.runtime.allowedCwds,
    agentBridgeService,
    client,
    logger,
    ...(options?.imageCache ? { imageCache: options.imageCache } : {}),
    ...(options?.messageDeduper ? { messageDeduper: options.messageDeduper } : {}),
    ...(options?.onEventReceived ? { onEventReceived: options.onEventReceived } : {})
  });

  const wsClient = new Lark.WSClient({
    appId: larkConfig.appId,
    appSecret: larkConfig.appSecret,
    loggerLevel: Lark.LoggerLevel.debug,
    logger: createSdkLoggerBridge(logger)
  });
  const instrumentedWsClient = wsClient as unknown as {
    handleControlData?: (data: unknown) => Promise<unknown>;
    handleEventData?: (data: {
      headers?: Array<{ key?: string; value?: string }>;
      payload?: Uint8Array;
    }) => Promise<unknown>;
  };
  if (instrumentedWsClient.handleControlData) {
    const originalHandleControlData = instrumentedWsClient.handleControlData.bind(wsClient);
    instrumentedWsClient.handleControlData = async (data: unknown) => {
      logger.info({ data }, "Lark WS control frame");
      return originalHandleControlData(data);
    };
  }
  if (instrumentedWsClient.handleEventData) {
    const originalHandleEventData = instrumentedWsClient.handleEventData.bind(wsClient);
    instrumentedWsClient.handleEventData = async (data) => {
      logger.info({
        headers: data?.headers ?? [],
        payloadSize: data?.payload ? data.payload.length : 0
      }, "Lark WS event frame");
      return originalHandleEventData(data as any);
    };
  }

  const eventDispatcher = new Lark.EventDispatcher({
    ...(larkConfig.encryptKey ? { encryptKey: larkConfig.encryptKey } : {}),
    ...(larkConfig.verificationToken ? { verificationToken: larkConfig.verificationToken } : {}),
    loggerLevel: Lark.LoggerLevel.debug,
    logger: createSdkLoggerBridge(logger)
  }).register({
    "im.message.receive_v1": async (data: unknown) => {
      logger.info("Received Lark im.message.receive_v1 event");
      await messageHandler(data as any);
    }
  });
  const originalInvoke = eventDispatcher.invoke.bind(eventDispatcher);
  eventDispatcher.invoke = async (data: any, params?: { needCheck?: boolean }) => {
    logger.info({
      eventType: data?.header?.event_type ?? data?.schema ?? "unknown",
      messageId: data?.event?.message?.message_id ?? null
    }, "Received raw Lark envelope");
    return originalInvoke(data, params);
  };

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
      options?.onConnected?.();
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

function createSdkLoggerBridge(logger: Logger) {
  return {
    error: (...args: unknown[]) => logger.error({ sdk: args }, "Lark SDK log"),
    warn: (...args: unknown[]) => logger.warn({ sdk: args }, "Lark SDK log"),
    info: (...args: unknown[]) => logger.info({ sdk: args }, "Lark SDK log"),
    debug: (...args: unknown[]) => logger.info({ sdk: args }, "Lark SDK debug"),
    trace: (...args: unknown[]) => logger.info({ sdk: args }, "Lark SDK trace")
  };
}
