type Waiter = (release: () => void) => void;

type LockState = {
  waiters: Waiter[];
};

class KeyedMutex {
  private readonly states = new Map<string, LockState>();

  public async runExclusive<T>(key: string, task: () => Promise<T> | T, timeoutMs?: number): Promise<T> {
    const release = await this.acquire(key, timeoutMs);

    try {
      return await task();
    } finally {
      release();
    }
  }

  private async acquire(key: string, timeoutMs?: number): Promise<() => void> {
    const existing = this.states.get(key);
    if (!existing) {
      this.states.set(key, { waiters: [] });
      return this.createRelease(key);
    }

    return await new Promise<() => void>((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null;
      const waiter: Waiter = (release) => {
        if (timer) {
          clearTimeout(timer);
        }
        resolve(release);
      };

      existing.waiters.push(waiter);
      if (typeof timeoutMs === "number" && timeoutMs > 0) {
        timer = setTimeout(() => {
          const index = existing.waiters.indexOf(waiter);
          if (index >= 0) {
            existing.waiters.splice(index, 1);
          }
          reject(new LockAcquisitionTimeoutError(key, timeoutMs));
        }, timeoutMs);
      }
    });
  }

  private createRelease(key: string): () => void {
    let released = false;

    return () => {
      if (released) {
        return;
      }

      released = true;
      const state = this.states.get(key);
      if (!state) {
        return;
      }

      const next = state.waiters.shift();
      if (next) {
        next(this.createRelease(key));
        return;
      }

      this.states.delete(key);
    };
  }
}

export class LockAcquisitionTimeoutError extends Error {
  public constructor(
    public readonly key: string,
    public readonly timeoutMs: number
  ) {
    super(`Timed out waiting ${timeoutMs}ms for lock ${key}`);
    this.name = "LockAcquisitionTimeoutError";
  }
}

export class RuntimeLocks {
  private readonly sessionLocks = new KeyedMutex();
  private readonly contextLocks = new KeyedMutex();
  private readonly repoMetadataLocks = new KeyedMutex();

  public async withSessionLock<T>(key: string, task: () => Promise<T> | T, timeoutMs?: number): Promise<T> {
    return await this.sessionLocks.runExclusive(key, task, timeoutMs);
  }

  public async withContextLock<T>(key: string, task: () => Promise<T> | T, timeoutMs?: number): Promise<T> {
    return await this.contextLocks.runExclusive(key, task, timeoutMs);
  }

  public async withRepoMetadataLock<T>(key: string, task: () => Promise<T> | T): Promise<T> {
    return await this.repoMetadataLocks.runExclusive(key, task);
  }
}
