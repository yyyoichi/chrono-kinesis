export type EngineResult = {
  position: number;
  velocity: number;
};

export interface EnginePort {
  compute(
    dt: number,
    position: number,
    velocity: number,
    target: number,
    out: EngineResult,
  ): void;
}
