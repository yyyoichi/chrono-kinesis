import type { SimulationState } from "../state";

export interface PhysicsPort {
  apply(state: SimulationState): void;
}
