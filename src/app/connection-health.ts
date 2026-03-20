import type { Logger } from "pino";

type PlatformHealth = {
  connectedAt: number | null;
  lastEventAt: number | null;
};

export class ConnectionHealthMonitor {
  private readonly state = new Map<string, PlatformHealth>();
  private reportTimer: NodeJS.Timeout | null = null;

  public constructor(
    private readonly logger: Logger,
    private readonly staleAfterMs = 5 * 60 * 1000,
    private readonly reportEveryMs = 60 * 1000
  ) {}

  public markConnected(platform: string): void {
    const current = this.state.get(platform) ?? { connectedAt: null, lastEventAt: null };
    current.connectedAt = Date.now();
    this.state.set(platform, current);
    this.logger.info({ platform }, "Platform connection established");
  }

  public markEvent(platform: string): void {
    const current = this.state.get(platform) ?? { connectedAt: null, lastEventAt: null };
    current.lastEventAt = Date.now();
    this.state.set(platform, current);
  }

  public start(): void {
    if (this.reportTimer) {
      return;
    }

    this.reportTimer = setInterval(() => {
      const now = Date.now();

      for (const [platform, health] of this.state.entries()) {
        const msSinceEvent = health.lastEventAt ? now - health.lastEventAt : null;
        const msSinceConnect = health.connectedAt ? now - health.connectedAt : null;

        if (msSinceEvent !== null && msSinceEvent > this.staleAfterMs) {
          this.logger.warn(
            { platform, msSinceEvent, msSinceConnect },
            "Platform connection appears stale"
          );
          continue;
        }

        this.logger.info(
          { platform, msSinceEvent, msSinceConnect },
          "Platform connection health"
        );
      }
    }, this.reportEveryMs);

    this.reportTimer.unref?.();
  }

  public stop(): void {
    if (!this.reportTimer) {
      return;
    }

    clearInterval(this.reportTimer);
    this.reportTimer = null;
  }
}
