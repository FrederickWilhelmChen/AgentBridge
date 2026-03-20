import type { AgentType } from "../domain/enums.js";
import type { Run, Session } from "../domain/models.js";

export type Platform = "slack" | "lark";

export type IncomingImageAttachment = {
  kind: "image";
  name: string | null;
  mimeType: string | null;
  sourceUrl: string | null;
  platformFileId: string | null;
  localPath: string | null;
};

export type IncomingPlatformMessage = {
  platform: Platform;
  platformUserId: string;
  platformChannelId: string;
  platformThreadId: string | null;
  messageId: string;
  rawText: string;
  attachments?: IncomingImageAttachment[];
};

export type MessageHandlingResult =
  | {
      kind: "execution";
      title: string;
      run: Run;
      session: Session | null;
    }
  | {
      kind: "status";
      agentType: AgentType;
      session: Session | null;
      run: Run | null;
    }
  | {
      kind: "info";
      text: string;
      session: Session | null;
    };
