import type { EnginePort, EngineResult } from "../../ports";

type LinearEngineParams = {
  settleMs: number;
};

export class LinearEngine implements EnginePort {
  private settleMs = 400;

  constructor(params?: Partial<LinearEngineParams>) {
    if (params?.settleMs) {
      this.settleMs = params.settleMs;
    }
  }

  public compute(
    dt: number,
    position: number,
    velocity: number,
    target: number,
    out: EngineResult,
  ): void {
    const distance = target - position;
    const settleSec = Math.max(this.settleMs / 1000, Number.EPSILON);
    const speed = Math.abs(distance) / settleSec;
    const step = speed * Math.max(dt, 0);
    const move = Math.sign(distance) * Math.min(Math.abs(distance), step);

    out.position = position + move;
    out.velocity = dt > 0 ? move / dt : velocity;
  }

  public clone(params: Partial<LinearEngineParams> = {}) {
    const copy = new LinearEngine();
    copy.settleMs = this.settleMs;
    if (params.settleMs) {
      copy.settleMs = params.settleMs;
    }
    return copy;
  }
}
