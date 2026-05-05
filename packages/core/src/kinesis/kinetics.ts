import type { EnginePort, EngineResult, KineticsPort, VectorReadablePort } from "../ports";
import type { SimulationState } from "../state";
import { SpringEngine } from "./engines/spring-engine";
import type { Options } from "./options";

export class Kinetics implements KineticsPort, VectorReadablePort {
  public static readonly ACTIVITY_THRESHOLD = 0.001;
  private _state: SimulationState = {
    ndim: 0,
    absolute: [],
    relative: [],
    velocity: [],
    activityLevel: 0,
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
    this._state.activityLevel = distance + velocity;
  }

  public vector(): Readonly<number[]> {
    return this._snapshot;
  }

  public snapshot(): void {
    this._snapshot = [...this._state.absolute];
  }

  public isActive() {
    return this._state.activityLevel > Kinetics.ACTIVITY_THRESHOLD;
  }

  public get state() {
    return this._state;
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
