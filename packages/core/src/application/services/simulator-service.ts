import type { SimulationContext } from "./simulation-context";

export interface SimulatorService {
  add(context: SimulationContext): void;
  run(): void;
  pause(): void;
  destroy(): void;
  manualStep(delta: number): void;
  setTickRate(tickRate: number): void;
}
