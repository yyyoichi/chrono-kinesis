import type { RatioReadablePort, ScalarReadablePort, SnapshotPort } from "../ports";
import { resolveScalar } from "./resolver";

export class ScalarThresholdRatio implements RatioReadablePort {
  private _snapshot = 0;
  private readonly thresholds: Readonly<number[]>;
  private readonly ratios: Readonly<number[]>;
  private readonly _dependencies: SnapshotPort[];

  constructor(
    private readonly source: ScalarReadablePort,
    /** 昇順しきい値。例: [600, 1024] */
    thresholds: number[],
    /** しきい値区間ごとの ratio。length は thresholds.length + 1 */
    ratios: number[],
  ) {
    this.thresholds = [...thresholds];
    this.ratios = ratios.map((x) => {
      const safe = Number.isFinite(x) ? x : 0;
      return Math.max(0, Math.min(1, safe));
    });
    if (this.ratios.length !== this.thresholds.length + 1) {
      throw new Error("ScalarThresholdRatio: ratios length must be thresholds.length + 1");
    }
    this._dependencies = [source];
    this.snapshot();
  }

  public snapshot(): void {
    const value = this.source.scalar;
    let index = 0;
    while (index < this.thresholds.length && value >= this.thresholds[index]) {
      index += 1;
    }
    this._snapshot = this.ratios[index];
  }

  public get ratio(): number {
    return this._snapshot;
  }

  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }
}

export class ScalarThresholdScalar implements ScalarReadablePort {
  private _snapshot = 0;
  private readonly thresholds: Readonly<number[]>;
  private readonly scalars: Array<() => number>;
  private readonly _dependencies: SnapshotPort[];

  constructor(
    private readonly source: ScalarReadablePort,
    /** 昇順しきい値。例: [600, 1024] */
    thresholds: number[],
    /** しきい値区間ごとの scalar。length は thresholds.length + 1 */
    scalars: Array<number | ScalarReadablePort>,
  ) {
    if (scalars.length !== thresholds.length + 1) {
      throw new Error("ScalarThresholdScalar: scalars length must be thresholds.length + 1");
    }
    this.thresholds = [...thresholds];
    const resolved = scalars.map((x) => {
      return resolveScalar(x, 0);
    });
    this.scalars = resolved.map((r) => r.getter);
    this._dependencies = [source];
    for (const r of resolved) {
      if (r.port) {
        this._dependencies.push(r.port);
      }
    }
    this.snapshot();
  }

  public snapshot(): void {
    const value = this.source.scalar;
    let index = 0;
    while (index < this.thresholds.length && value >= this.thresholds[index]) {
      index += 1;
    }
    this._snapshot = this.scalars[index]();
  }

  public get scalar(): number {
    return this._snapshot;
  }

  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }
}
