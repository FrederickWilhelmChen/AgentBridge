import * as Lark from "@larksuiteoapi/node-sdk";
import type { Readable } from "node:stream";
import { buildLarkProgressCard, buildLarkTextMessage, type LarkMessageContent } from "./messages.js";
import { createLarkHttpInstance } from "./http.js";

export class LarkClient {
  private readonly client: Lark.Client;

  public constructor(config: { appId: string; appSecret: string; proxyUrl?: string | null }) {
    this.client = new Lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
      httpInstance: createLarkHttpInstance(config.proxyUrl ?? null)
    });
  }

  public async replyToMessage(messageId: string, content: LarkMessageContent): Promise<void> {
    try {
      await this.client.im.v1.message.reply({
        path: {
          message_id: messageId
        },
        data: {
          content: content.content,
          msg_type: content.msg_type
        }
      });
    } catch (error) {
      throw formatLarkAxiosError("reply message", error);
    }
  }

  public async replyWithText(messageId: string, text: string): Promise<void> {
    await this.replyToMessage(messageId, buildLarkTextMessage(text));
  }

  public async replyWithProgressCard(messageId: string, title: string, status: string, body: string): Promise<string> {
    try {
      const response = await this.client.im.v1.message.reply({
        path: {
          message_id: messageId
        },
        data: buildLarkProgressCard(title, status, body)
      });
      const repliedMessageId = (response as { data?: { message_id?: string } })?.data?.message_id;
      if (!repliedMessageId) {
        throw new Error("Lark progress card reply returned no message id");
      }
      return repliedMessageId;
    } catch (error) {
      throw formatLarkAxiosError("reply progress card", error);
    }
  }

  public async updateProgressCard(messageId: string, title: string, status: string, body: string): Promise<void> {
    try {
      await this.client.im.v1.message.patch({
        path: {
          message_id: messageId
        },
        data: buildLarkProgressCard(title, status, body)
      });
    } catch (error) {
      throw formatLarkAxiosError("update progress card", error);
    }
  }

  public async downloadImage(messageId: string, imageKey: string): Promise<{
    bytes: Uint8Array;
    mimeType: string | null;
    name: string | null;
  }> {
    let response: unknown;
    try {
      response = await this.client.im.v1.messageResource.get({
        path: {
          message_id: messageId,
          file_key: imageKey
        },
        params: {
          type: "image"
        }
      });
    } catch (error) {
      throw formatLarkAxiosError("download image", error);
    }

    const rawData = response as unknown as {
      getReadableStream?: () => Readable;
      headers?: Record<string, string | string[] | undefined>;
    };

    const headerValue = rawData.headers?.["content-type"];
    const mimeType = Array.isArray(headerValue)
      ? headerValue[0] ?? null
      : headerValue ?? null;
    const bytes = await readLarkResourceBytes(rawData);

    return {
      bytes,
      mimeType,
      name: imageKey
    };
  }
}

function toUint8Array(value: Buffer | Uint8Array | ArrayBuffer | undefined): Uint8Array {
  if (!value) {
    throw new Error("Lark image download returned no file bytes");
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  return new Uint8Array(value);
}

export async function readLarkResourceBytes(resource: {
  getReadableStream?: () => Readable;
}): Promise<Uint8Array> {
  if (!resource.getReadableStream) {
    throw new Error("Lark image download returned no file bytes");
  }

  const stream = resource.getReadableStream();
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    chunks.push(Buffer.from(chunk));
  }

  return toUint8Array(Buffer.concat(chunks));
}

function formatLarkAxiosError(action: string, error: unknown): Error {
  const axiosError = error as {
    message?: string;
    response?: {
      status?: number;
      data?: unknown;
    };
  };

  const status = axiosError.response?.status;
  const responseData = safeStringify(axiosError.response?.data);
  const suffix = [
    status ? `status=${status}` : null,
    responseData ? `response=${responseData}` : null
  ].filter(Boolean).join(" ");

  return new Error(
    suffix
      ? `Lark ${action} failed: ${suffix}`
      : `Lark ${action} failed: ${axiosError.message ?? "unknown error"}`
  );
}

function safeStringify(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
