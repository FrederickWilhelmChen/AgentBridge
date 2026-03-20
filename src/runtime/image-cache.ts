import fs from "node:fs/promises";
import path from "node:path";
import type { IncomingImageAttachment } from "../platform/types.js";

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export class ImageCache {
  private readonly cacheDir: string;
  private readonly maxAgeMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  public constructor(options: {
    cacheDir: string;
    maxAgeMs?: number;
    fetchImpl?: typeof fetch;
    now?: () => number;
  }) {
    this.cacheDir = options.cacheDir;
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  public async cacheSlackAttachments(
    attachments: IncomingImageAttachment[],
    options: {
      botToken: string;
      messageId: string;
    }
  ): Promise<IncomingImageAttachment[]> {
    if (attachments.length === 0) {
      return attachments;
    }

    await fs.mkdir(this.cacheDir, { recursive: true });

    return Promise.all(
      attachments.map(async (attachment, index) => {
        if (!attachment.sourceUrl) {
          return attachment;
        }

        const response = await this.fetchImpl(attachment.sourceUrl, {
          headers: {
            Authorization: `Bearer ${options.botToken}`
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to download Slack image: ${response.status}`);
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        const ext = resolveExtension(attachment);
        const filename = `${sanitizeSegment(options.messageId)}-${sanitizeSegment(attachment.platformFileId ?? `${index}`)}${ext}`;
        const localPath = path.join(this.cacheDir, filename);
        await fs.writeFile(localPath, bytes);

        return {
          ...attachment,
          localPath
        };
      })
    );
  }

  public async cleanupExpiredFiles(): Promise<number> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const entries = await fs.readdir(this.cacheDir, { withFileTypes: true });
    let removedCount = 0;

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const filePath = path.join(this.cacheDir, entry.name);
      const stats = await fs.stat(filePath);
      if (this.now() - stats.mtimeMs <= this.maxAgeMs) {
        continue;
      }

      await fs.rm(filePath, { force: true });
      removedCount += 1;
    }

    return removedCount;
  }

  public async cacheLarkAttachments(
    attachments: IncomingImageAttachment[],
    options: {
      messageId: string;
      download: (attachment: IncomingImageAttachment) => Promise<{
        bytes: Uint8Array;
        mimeType: string | null;
        name: string | null;
      }>;
    }
  ): Promise<IncomingImageAttachment[]> {
    if (attachments.length === 0) {
      return attachments;
    }

    await fs.mkdir(this.cacheDir, { recursive: true });

    return Promise.all(
      attachments.map(async (attachment, index) => {
        const downloaded = await options.download(attachment);
        const mergedAttachment: IncomingImageAttachment = {
          ...attachment,
          mimeType: downloaded.mimeType ?? attachment.mimeType,
          name: downloaded.name ?? attachment.name
        };
        const ext = resolveExtension(mergedAttachment);
        const filename = `${sanitizeSegment(options.messageId)}-${sanitizeSegment(attachment.platformFileId ?? `${index}`)}${ext}`;
        const localPath = path.join(this.cacheDir, filename);
        await fs.writeFile(localPath, downloaded.bytes);

        return {
          ...mergedAttachment,
          localPath
        };
      })
    );
  }
}

function resolveExtension(attachment: IncomingImageAttachment): string {
  const fromName = attachment.name ? path.extname(attachment.name) : "";
  if (fromName) {
    return fromName;
  }

  switch (attachment.mimeType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".img";
  }
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
