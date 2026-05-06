import type { ClockPort, KineticsPort, PhysicsPort, VectorReadablePort } from "../ports";

export type SimulationContext = {
  clock: ClockPort;
  target: VectorReadablePort;
  kinetics: KineticsPort;
  physics: PhysicsPort | PhysicsPort[];
};
