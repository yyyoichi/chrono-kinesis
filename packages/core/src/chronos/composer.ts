import type { ClockPort } from "../ports";
import { BaseClock } from "./base-clock";

export class ClockComposer extends BaseClock {
  private readonly clocks: ClockPort[];

  constructor(...clocks: ClockPort[]) {
    super();
    this.clocks = clocks;
    for (const clock of this.clocks) {
      clock.onHeartbeat(() => {
        this._heartbeat();
      });
    }
  }

  public isActive(): boolean {
    for (const clock of this.clocks) {
      if (clock.isActive()) {
        return true;
      }
    }
    return false;
  }

  public destroy(): void {
    for (const clock of this.clocks) {
      clock.destroy();
    }
    super.destroy();
  }
}
