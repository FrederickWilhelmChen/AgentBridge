import * as Lark from "@larksuiteoapi/node-sdk";
import { buildLarkTextMessage, type LarkMessageContent } from "./messages.js";

export class LarkClient {
  private readonly client: Lark.Client;

  public constructor(config: { appId: string; appSecret: string }) {
    this.client = new Lark.Client({
      appId: config.appId,
      appSecret: config.appSecret
    });
  }

  public async replyToMessage(messageId: string, content: LarkMessageContent): Promise<void> {
    await this.client.im.v1.message.reply({
      path: {
        message_id: messageId
      },
      data: {
        content: content.content,
        msg_type: content.msg_type
      }
    });
  }

  public async replyWithText(messageId: string, text: string): Promise<void> {
    await this.replyToMessage(messageId, buildLarkTextMessage(text));
  }
}
