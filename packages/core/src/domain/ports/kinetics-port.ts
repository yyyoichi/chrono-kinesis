import type { SimulationState } from "../models/simulation-state";
import type { ActivityPort } from "./activity-port";
import type { SnapshotPort } from "./snapshot-port";

export interface KineticsPort extends ActivityPort, SnapshotPort {
  compute(dt: number, vector: Readonly<number[]>): void;
  readonly state: SimulationState;
  readonly activityScore: number;
}
