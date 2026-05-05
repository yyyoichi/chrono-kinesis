import type { EnginePort, EngineResult } from "../../ports";

export class DirectEngine implements EnginePort {
  public compute(
    _dt: number,
    _position: number,
    _velocity: number,
    target: number,
    out: EngineResult,
  ): void {
    out.position = target;
    out.velocity = 0;
  }
}
