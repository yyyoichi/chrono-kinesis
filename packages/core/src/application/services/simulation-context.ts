import type {
  ClockPort,
  DisposablePort,
  KineticsPort,
  PhysicsPort,
  VectorReadablePort,
} from "../../domain/ports";

export type SimulationContext = {
  clock: ClockPort;
  kinetics: KineticsPort;
  target: VectorReadablePort;
  physics: PhysicsPort | PhysicsPort[];
  // simulation終了時にdestoryされるべきインスタンス。Clockはauto disposeされるため、ここに含める必ずしも必要ではない。
  disposables?: DisposablePort[];
};
