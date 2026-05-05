import type { EnginePort, EngineResult } from "../../ports";

type SpringEngineParams = {
  settleMs: number;
  zeta: number; // // ζ: 減衰比（0: 非減衰, 1: 臨界減衰, >1: 過減衰）
};

export class SpringEngine implements EnginePort {
  // 係数のデフォルトはsettleMs=600ms, zeta=0.95

  private k = 58.78;
  private m = 1;
  private c = 14.57;

  constructor(params?: Partial<SpringEngineParams>) {
    if (params) {
      this.setParam(params);
    }
  }

  public compute(
    dt: number,
    position: number,
    velocity: number,
    target: number,
    out: EngineResult,
  ): void {
    const forceSpring = -this.k * (position - target);
    const forceDamper = -this.c * velocity;
    const acc = (forceSpring + forceDamper) / this.m;

    const nextVelocity = velocity + acc * dt;
    const nextPosition = position + nextVelocity * dt;
    out.position = nextPosition;
    out.velocity = nextVelocity;
  }

  public clone(params: Partial<SpringEngineParams>) {
    const copy = new SpringEngine();
    copy.k = this.k;
    copy.m = this.m;
    copy.c = this.c;
    copy.setParam(params);
    return copy;
  }

  private setParam(params: Partial<SpringEngineParams>) {
    this.k = params.settleMs ? this.m * (4.6 / (params.settleMs / 1000)) ** 2 : this.k;
    this.c = params.zeta ? 2 * Math.sqrt(this.k * this.m) * params.zeta : this.c;
  }
}
