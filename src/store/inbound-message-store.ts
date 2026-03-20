import type { Database } from "better-sqlite3";
import type { Platform } from "../platform/types.js";

export type InboundMessageReceipt = {
  platform: Platform;
  messageId: string;
  status: "processing" | "completed";
  createdAt: string;
  completedAt: string | null;
};

type InboundMessageRow = {
  platform: Platform;
  message_id: string;
  status: InboundMessageReceipt["status"];
  created_at: string;
  completed_at: string | null;
};

function mapReceipt(row: InboundMessageRow): InboundMessageReceipt {
  return {
    platform: row.platform,
    messageId: row.message_id,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

export class InboundMessageStore {
  public constructor(private readonly database: Database) {}

  public tryBegin(platform: Platform, messageId: string): boolean {
    const now = new Date().toISOString();
    const result = this.database
      .prepare(`
        INSERT OR IGNORE INTO inbound_message_receipts (
          platform, message_id, status, created_at, completed_at
        ) VALUES (
          @platform, @messageId, 'processing', @createdAt, NULL
        )
      `)
      .run({
        platform,
        messageId,
        createdAt: now
      });

    return result.changes > 0;
  }

  public markCompleted(platform: Platform, messageId: string): void {
    this.database
      .prepare(`
        UPDATE inbound_message_receipts
        SET status = 'completed',
            completed_at = @completedAt
        WHERE platform = @platform AND message_id = @messageId
      `)
      .run({
        platform,
        messageId,
        completedAt: new Date().toISOString()
      });
  }

  public release(platform: Platform, messageId: string): void {
    this.database
      .prepare("DELETE FROM inbound_message_receipts WHERE platform = ? AND message_id = ?")
      .run(platform, messageId);
  }

  public findByMessageId(platform: Platform, messageId: string): InboundMessageReceipt | null {
    const row = this.database
      .prepare("SELECT * FROM inbound_message_receipts WHERE platform = ? AND message_id = ?")
      .get(platform, messageId) as InboundMessageRow | undefined;

    return row ? mapReceipt(row) : null;
  }
}
