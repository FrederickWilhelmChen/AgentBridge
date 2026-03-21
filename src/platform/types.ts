import type { Run, Session } from "../domain/models.js";
import type { WorkspaceKind } from "../domain/enums.js";

export type Platform = "slack" | "lark";

export type SelectableWorkspace = {
  rootPath: string;
  label: string;
  kind: WorkspaceKind;
};

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
      kind: "info";
      text: string;
      session: Session | null;
    };
