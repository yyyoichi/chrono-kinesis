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
  // simulation終了時にDefaultSimulatorService.destroy()によってdestroyされるべきインスタンス群。
  // phaseObserversに含めたインスタンスはここ(disposables)に重複して含めないこと（同じインスタンスを両方に入れるとdestroy()が二重に呼ばれる可能性がある）。
  // Clockはauto disposeされるため、ここに含める必要は必ずしもない。
  disposables?: DisposablePort[];
};
