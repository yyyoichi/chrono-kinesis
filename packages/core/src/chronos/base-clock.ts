import type { ClockPort } from "../ports";

export abstract class BaseClock implements ClockPort {
  // TODO: Clock開始直後にsimulatorから呼ばれるまでにinactiveになる可能性が残るため長めに設定。初回Clock時に確実に実行する機構が必要。
  private static readonly ACTIVITY_THRESHOLD = 300;
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
    return performance.now() - this._latestHeartbeatTime < BaseClock.ACTIVITY_THRESHOLD;
  }
  public destroy(): void {
    this.callbacks = [];
  }
}
