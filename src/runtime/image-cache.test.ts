import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ImageCache } from "./image-cache.js";

test("downloads Slack image attachments into the cache directory", async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentbridge-image-cache-"));
  const imageCache = new ImageCache({
    cacheDir,
    fetchImpl: async () =>
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: {
          "content-type": "image/png"
        }
      })
  });

  const attachments = await imageCache.cacheSlackAttachments([
    {
      kind: "image",
      name: "error.png",
      mimeType: "image/png",
      sourceUrl: "https://files.slack.com/files-pri/T123-F123/error.png",
      platformFileId: "F123",
      localPath: null
    }
  ], {
    botToken: "xoxb-test",
    messageId: "171"
  });

  assert.equal(attachments[0]?.localPath !== null, true);
  assert.match(attachments[0]?.localPath ?? "", /F123/);
  const savedBytes = await fs.readFile(attachments[0]?.localPath ?? "");
  assert.deepEqual([...savedBytes], [1, 2, 3, 4]);

  await fs.rm(cacheDir, { recursive: true, force: true });
});

test("removes cached images older than seven days", async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentbridge-image-cleanup-"));
  const oldFile = path.join(cacheDir, "old.png");
  const freshFile = path.join(cacheDir, "fresh.png");
  await fs.writeFile(oldFile, "old");
  await fs.writeFile(freshFile, "fresh");

  const now = Date.UTC(2026, 2, 19, 12, 0, 0);
  const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
  const oneDayMs = 24 * 60 * 60 * 1000;
  await fs.utimes(oldFile, new Date(now - eightDaysMs), new Date(now - eightDaysMs));
  await fs.utimes(freshFile, new Date(now - oneDayMs), new Date(now - oneDayMs));

  const imageCache = new ImageCache({
    cacheDir,
    now: () => now
  });

  const removedCount = await imageCache.cleanupExpiredFiles();

  assert.equal(removedCount, 1);
  await assert.rejects(fs.stat(oldFile));
  await fs.stat(freshFile);

  await fs.rm(cacheDir, { recursive: true, force: true });
});
