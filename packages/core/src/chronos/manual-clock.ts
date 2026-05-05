import { BaseClock } from "./base-clock";

// 手動Clock
export class ManualClock extends BaseClock {
  public heartbeat() {
    return this._heartbeat();
  }
}
