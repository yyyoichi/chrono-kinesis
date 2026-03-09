import type { ClockPort } from "./ports";

export abstract class BaseClock implements ClockPort {
  private static readonly ACTIVITY_THRESHOLD = 100;
  private _latestHeartbeatTime: number = 0;
  private callbacks: Array<() => void> = [];
  protected _heartbeat: () => void = () => {
    this._latestHeartbeatTime = performance.now();
    for (const cb of this.callbacks) {
      cb();
    }
  };
  public onHeartbeat(cb: () => void) {
    this.callbacks.push(cb);
  }
  public isActive(): boolean {
    return (
      performance.now() - this._latestHeartbeatTime <
      BaseClock.ACTIVITY_THRESHOLD
    );
  }
  public destroy(): void {
    this.callbacks = [];
  }
}

// 手動Clock
export class ManualClock extends BaseClock {
  public heartbeat() {
    return this._heartbeat();
  }
}
