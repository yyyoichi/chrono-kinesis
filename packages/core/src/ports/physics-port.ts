import type { SimulationState } from "../domain/models/simulation-state";

export interface PhysicsPort {
  apply(state: SimulationState): void;
}
