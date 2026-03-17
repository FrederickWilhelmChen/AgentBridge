import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const historyPath = path.join(os.homedir(), ".codex", "history.jsonl");
const sessionIndexPath = path.join(os.homedir(), ".codex", "session_index.jsonl");

type CodexHistoryEntry = {
  session_id: string;
  ts: number;
  text: string;
};

type CodexSessionIndexEntry = {
  id: string;
  updated_at: string;
};

export async function captureCodexState(): Promise<{
  historyCount: number;
  sessionIndexCount: number;
}> {
  const [historyEntries, sessionEntries] = await Promise.all([
    readJsonlFile<CodexHistoryEntry>(historyPath),
    readJsonlFile<CodexSessionIndexEntry>(sessionIndexPath)
  ]);

  return {
    historyCount: historyEntries.length,
    sessionIndexCount: sessionEntries.length
  };
}

export async function discoverCodexSessionId(snapshot: {
  historyCount: number;
  sessionIndexCount: number;
}): Promise<string | null> {
  const [historyEntries, sessionEntries] = await Promise.all([
    readJsonlFile<CodexHistoryEntry>(historyPath),
    readJsonlFile<CodexSessionIndexEntry>(sessionIndexPath)
  ]);

  const newHistoryEntry = historyEntries.slice(snapshot.historyCount).at(-1);
  if (newHistoryEntry?.session_id) {
    return newHistoryEntry.session_id;
  }

  const newSessionEntry = sessionEntries.slice(snapshot.sessionIndexCount).at(-1);
  if (newSessionEntry?.id) {
    return newSessionEntry.id;
  }

  return historyEntries.at(-1)?.session_id ?? sessionEntries.at(-1)?.id ?? null;
}

async function readJsonlFile<T>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as T];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}
