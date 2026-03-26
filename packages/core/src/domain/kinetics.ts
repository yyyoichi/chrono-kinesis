import type { SimulationState } from "./models/simulation-state";
import type {
  EnginePort,
  KineticsPort,
  PositionReadablePort,
  SnapshotPort,
  VectorReadablePort,
} from "./ports";

type EngineResult = {
  position: number;
  velocity: number;
};

type Options = {
  engine?: EnginePort | EnginePort[];
};

export class Kinetics implements KineticsPort, VectorReadablePort {
  private static ACTIVITY_THRESHOLD = 0.001;
  private _energy = 0;
  private _state: SimulationState = {
    ndim: 0,
    absolute: [],
    relative: [],
    velocity: [],
  };
  private _snapshot: number[] = [];
  private engines: EnginePort[] = [];

  constructor(
    init: Readonly<[number, number]> | Readonly<number[]> | number[],
    options: Options = {},
  ) {
    this._state.ndim = init.length;
    this._state.absolute = [...init];
    this._state.relative = new Array(this._state.ndim).fill(0);
    this._state.velocity = new Array(this._state.ndim).fill(0);
    this.setEngine(options.engine ?? new SpringEngine());
    this.snapshot();
  }

  public compute(dt: number, vector: Readonly<number[]>) {
    const ndim = Math.min(vector.length, this._state.ndim);
    const out: EngineResult = { position: 0, velocity: 0 };
    let distanceSquared = 0;
    for (let n = 0; n < ndim; n++) {
      this.engineAt(n).compute(
        dt,
        this._state.absolute[n],
        this._state.velocity[n],
        vector[n],
        out,
      );
      const delta = out.position - this._state.absolute[n];
      this._state.relative[n] += delta;
      distanceSquared += delta * delta;
      this._state.absolute[n] = out.position;
      this._state.velocity[n] = out.velocity;
    }

    const distance = Math.sqrt(distanceSquared);
    const velocity = Math.hypot(...this._state.velocity);
    this._energy = distance + velocity;
  }

  public vector(): Readonly<number[]> {
    return this._snapshot;
  }

  public snapshot(): void {
    this._snapshot = [...this._state.absolute];
  }

  public isActive() {
    return this._energy > Kinetics.ACTIVITY_THRESHOLD;
  }

  public get state() {
    return this._state;
  }
  public get activityScore() {
    return this._energy;
  }

  public setEngine(engine: EnginePort | EnginePort[]) {
    if (!Array.isArray(engine)) {
      this.engines = new Array(this._state.ndim).fill(engine);
      return;
    }
    if (engine.length === 0) {
      engine.push(new SpringEngine());
    }
    this.engines = new Array(this._state.ndim)
      .fill(null)
      .map((_, index) => engine[index] ?? engine[engine.length - 1]);
  }

  private engineAt(n: number): EnginePort {
    return this.engines[n] ?? this.engines[this.engines.length - 1];
  }

  /**
   * 基準としている初期座標を再基準化します。
   * relative をシフトして新しい初期座標に合わせます。
   * absolute、velocity、energy は保持されます。
   * @param newInit 新しい初期座標
   */
  protected teleport(newInit: readonly number[]): void {
    const ndim = Math.min(newInit.length, this._state.ndim);
    for (let i = 0; i < ndim; i++) {
      const currentInitial = this._state.absolute[i] - this._state.relative[i];
      const delta = newInit[i] - currentInitial;
      this._state.relative[i] -= delta;
    }
  }
}

// 明示的にベクトル[0, 1]を[x, y]のPositionとしてKineticsを利用するクラス。
export class PositionKinetics extends Kinetics implements PositionReadablePort {
  constructor(absolute: Readonly<[number, number]> | Readonly<number[]>, options: Options = {}) {
    const length = absolute.length;
    if (length < 2) {
      throw new Error("PositionKinetics requires at least 2 dimensions");
    }
    super(absolute, options);
  }
  public position(): Readonly<[number, number]> {
    const [x, y] = this.vector();
    return [x, y];
  }
}

/**
 * 初期座標が変更される Kinetics。
 * このインスタンスをTargetに登録するか、 コンストラクタで渡す vector をTargetに登録してください。
 */
export class TeleportKinetics extends Kinetics {
  // 初期座標 vector 。
  private readonly _vector: VectorReadablePort;
  // 現在の初期座標
  // snaphot時かcompute時に比較され、変更がある場合teleportされます。
  // いずれで変更されてもsnapshotが正しい限りteleportは正常に動作します。
  private _currentInit: Readonly<number[]> = [];
  private readonly _dependencies: SnapshotPort[];

  constructor(vector: VectorReadablePort, options: Options = {}) {
    super(vector.vector(), options);
    this._vector = vector;
    this._currentInit = vector.vector();
    this._dependencies = [vector];
  }

  public compute(dt: number, vector: Readonly<number[]>): void {
    this.updateCurrent();
    super.compute(dt, vector);
  }
  public snapshot(): void {
    this.updateCurrent();
    super.snapshot();
  }
  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }
  private updateCurrent() {
    const next = this._vector.vector();
    if (this._currentInit === next) return;
    super.teleport(next);
    this._currentInit = next;
  }
}

type SpringEngineParams = {
  settleMs: number;
  zeta: number; // // ζ: 減衰比（0: 非減衰, 1: 臨界減衰, >1: 過減衰）
};

type LinearEngineParams = {
  settleMs: number;
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
