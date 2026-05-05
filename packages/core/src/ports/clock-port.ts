import type { ActivityPort } from "./activity-port";
import type { DisposablePort } from "./disposable-port";

export interface ClockPort extends ActivityPort, DisposablePort {
  onHeartbeat(cb: () => void): void;
}
