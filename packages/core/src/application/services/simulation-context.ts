import type {
  ClockPort,
  DisposablePort,
  KineticsPort,
  PhysicsPort,
  VectorReadablePort,
} from "../../domain/ports";
import type { SimulationPhaseObserver } from "./simulation-phase-observer";

export type SimulationContext = {
  clock: ClockPort;
  kinetics: KineticsPort;
  target: VectorReadablePort;
  physics: PhysicsPort | PhysicsPort[];
  phaseObservers?: SimulationPhaseObserver[];
  // simulation終了時にdestoryされるべきインスタンス。Clockはauto disposeされるため、ここに含める必ずしも必要ではない。
  disposables?: DisposablePort[];
};
