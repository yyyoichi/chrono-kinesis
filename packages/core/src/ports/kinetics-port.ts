import type { SimulationState } from "../state";
import type { ActivityPort } from "./activity-port";

export interface KineticsPort extends ActivityPort {
  compute(dt: number, vector: Readonly<number[]>): void;
  readonly state: SimulationState;
}

export interface CloneableKineticsPort {
  clone(): KineticsPort;
}
