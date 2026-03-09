import type { SimulationState } from "../models/simulation-state";

export interface PhysicsPort {
  apply(state: SimulationState): void;
}
