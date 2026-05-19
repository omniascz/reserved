// Generic interval poller. Volá `tick()` každých N sekund.
// Chyby loguje, ale neukončí — worker pokračuje při dalším tiku.

export interface PollerOptions {
  name: string;
  intervalSeconds: number;
  tick: () => Promise<void>;
}

export class Poller {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inflight = false;

  constructor(private readonly opts: PollerOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    const intervalMs = this.opts.intervalSeconds * 1000;
    // První tick okamžitě, další podle intervalu
    setImmediate(() => this.runOnce());
    this.timer = setInterval(() => this.runOnce(), intervalMs);
    // eslint-disable-next-line no-console
    console.log(`[poller:${this.opts.name}] started, tick every ${this.opts.intervalSeconds}s`);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // eslint-disable-next-line no-console
    console.log(`[poller:${this.opts.name}] stopped`);
  }

  private async runOnce(): Promise<void> {
    if (this.inflight || !this.running) return;
    this.inflight = true;
    try {
      await this.opts.tick();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[poller:${this.opts.name}] tick error:`, err);
    } finally {
      this.inflight = false;
    }
  }
}
