import type {
  ClockPort,
  DisposablePort,
  KineticsPort,
  PhysicsPort,
  VectorReadablePort,
} from "../../domain/ports";
import type { KineticsEventPort } from "./simulation-event-port";

export type SimulationContext = {
  clock: ClockPort;
  kinetics: KineticsPort;
  target: VectorReadablePort;
  physics: PhysicsPort | PhysicsPort[];
  kineticsEvent?: KineticsEventPort;
  // simulation終了時にdestoryされるべきインスタンス。Clockはauto disposeされるため、ここに含める必ずしも必要ではない。
  disposables?: DisposablePort[];
};
