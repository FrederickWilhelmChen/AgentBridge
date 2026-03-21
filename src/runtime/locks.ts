type Waiter = (release: () => void) => void;

type LockState = {
  waiters: Waiter[];
};

class KeyedMutex {
  private readonly states = new Map<string, LockState>();

  public async runExclusive<T>(key: string, task: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire(key);

    try {
      return await task();
    } finally {
      release();
    }
  }

  private async acquire(key: string): Promise<() => void> {
    const existing = this.states.get(key);
    if (!existing) {
      this.states.set(key, { waiters: [] });
      return this.createRelease(key);
    }

    return await new Promise<() => void>((resolve) => {
      existing.waiters.push(resolve);
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

export class RuntimeLocks {
  private readonly sessionLocks = new KeyedMutex();
  private readonly contextLocks = new KeyedMutex();
  private readonly repoMetadataLocks = new KeyedMutex();

  public async withSessionLock<T>(key: string, task: () => Promise<T> | T): Promise<T> {
    return await this.sessionLocks.runExclusive(key, task);
  }

  public async withContextLock<T>(key: string, task: () => Promise<T> | T): Promise<T> {
    return await this.contextLocks.runExclusive(key, task);
  }

  public async withRepoMetadataLock<T>(key: string, task: () => Promise<T> | T): Promise<T> {
    return await this.repoMetadataLocks.runExclusive(key, task);
  }
}
