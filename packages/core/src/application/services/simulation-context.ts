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
  // simulation終了時にDefaultSimulatorService.destroy()によってdestroyされるべきインスタンス群。
  // Clockはauto disposeされるため、ここに含める必要は必ずしもない。
  disposables?: DisposablePort[];
};
