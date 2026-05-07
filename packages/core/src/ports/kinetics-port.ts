import type { SimulationState } from "../state";
import type { ActivityPort } from "./activity-port";
import type { VectorReadablePort } from "./readable-port";

export interface KineticsPort extends ActivityPort, VectorReadablePort {
  compute(dt: number, vector: Readonly<number[]>): void;
  readonly state: SimulationState;
}
