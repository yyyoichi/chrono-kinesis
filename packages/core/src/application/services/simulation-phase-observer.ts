import type { DisposablePort } from "../../domain/ports";

export type SimulationPhase = "snapshotted" | "computed";

export interface SimulationPhaseObserver extends DisposablePort {
  notify(phase: SimulationPhase): void;
}
