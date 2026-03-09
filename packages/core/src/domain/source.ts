import type {
  PositionReadablePort,
  ProgressReadablePort,
  SizeReadablePort,
  SnapshotPort,
  VectorReadablePort,
} from "./ports";

export class CenteredSource
  implements PositionReadablePort, VectorReadablePort
{
  private _snapshot: [number, number] = [0, 0];
  constructor(
    private readonly source: SizeReadablePort & PositionReadablePort,
  ) {
    this.snapshot();
  }
  public snapshot() {
    const [x, y] = this.source.position();
    const [width, height] = this.source.size();
    this._snapshot = [x + width / 2, y + height / 2];
    return;
  }
  public position(): Readonly<[number, number]> {
    return this._snapshot;
  }
  public vector(): Readonly<number[]> {
    return this._snapshot;
  }
  public dependencies(): SnapshotPort[] {
    return [this.source];
  }
}

type OffsetPositionSourceOptions = {
  leftPx?: number;
  topPx?: number;
};

export class OffsetPositionSource
  implements PositionReadablePort, VectorReadablePort
{
  private readonly leftPx: number;
  private readonly topPx: number;
  private _snapshot: [number, number] = [0, 0];

  constructor(
    private readonly source: PositionReadablePort,
    options: OffsetPositionSourceOptions = {},
  ) {
    this.leftPx = options.leftPx ?? 0;
    this.topPx = options.topPx ?? 0;
  }

  public snapshot(): void {
    const [x, y] = this.source.position();
    this._snapshot = [x + this.leftPx, y + this.topPx];
  }
  public position(): Readonly<[number, number]> {
    return this._snapshot;
  }
  public vector(): Readonly<number[]> {
    return this._snapshot;
  }
  public dependencies(): SnapshotPort[] {
    return [this.source];
  }
}

type ArcSourceOptions = {
  arcHeight?: number;
  apexProgress?: number;
  parameterization?: "parametric" | "arc-length";
  arcLengthSamples?: number;
};

export class ArcSource implements VectorReadablePort {
  private readonly arcHeight?: number;
  private readonly apexProgress: number;
  private readonly parameterization: "parametric" | "arc-length";
  private readonly arcLengthSamples: number;

  private _snapshot: [number, number] = [0, 0];

  constructor(
    private readonly pointA: PositionReadablePort,
    private readonly pointB: PositionReadablePort,
    private readonly progress: ProgressReadablePort,
    options: ArcSourceOptions = {},
  ) {
    this.arcHeight = options.arcHeight;
    const rawApexProgress = options.apexProgress ?? 0.5;
    this.apexProgress = Math.max(0.01, Math.min(0.99, rawApexProgress));
    this.parameterization = options.parameterization ?? "parametric";
    this.arcLengthSamples = Math.max(8, options.arcLengthSamples ?? 40);

    this.snapshot();
  }

  public vector(): Readonly<number[]> {
    return this._snapshot;
  }
  public snapshot(): void {
    const rawProgress = this.progress.progress;
    const progress = Number.isFinite(rawProgress) ? rawProgress : 0;
    const progressClamped = Math.max(0, Math.min(1, progress));
    const a = this.pointA.position();
    const b = this.pointB.position();

    if (progressClamped <= 0) {
      this._snapshot = [a[0], a[1]];
    }
    if (progressClamped >= 1) {
      this._snapshot = [b[0], b[1]];
    }

    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const baseHeight = Math.hypot(dx, dy) * 0.25;
    const height = this.arcHeight ?? baseHeight;
    const topY = Math.min(a[1], b[1]);
    const peakY = topY - height;

    const apexT = this.apexProgress;
    const oneMinusApexT = 1 - apexT;
    const controlY =
      (peakY - oneMinusApexT * oneMinusApexT * a[1] - apexT * apexT * b[1]) /
      (2 * oneMinusApexT * apexT);
    const controlX = (a[0] + b[0]) * 0.5;

    const t =
      this.parameterization === "arc-length"
        ? this.toArcLengthT(progressClamped, a, [controlX, controlY], b)
        : progressClamped;

    const oneMinusT = 1 - t;
    const x =
      oneMinusT * oneMinusT * a[0] +
      2 * oneMinusT * t * controlX +
      t * t * b[0];
    const y =
      oneMinusT * oneMinusT * a[1] +
      2 * oneMinusT * t * controlY +
      t * t * b[1];
    this._snapshot = [x, y];
  }
  public dependencies(): SnapshotPort[] {
    return [this.pointA, this.pointB, this.progress];
  }

  private bezierPoint(
    t: number,
    a: Readonly<number[]>,
    c: Readonly<number[]>,
    b: Readonly<number[]>,
  ): Readonly<number[]> {
    const oneMinusT = 1 - t;
    return [
      oneMinusT * oneMinusT * a[0] + 2 * oneMinusT * t * c[0] + t * t * b[0],
      oneMinusT * oneMinusT * a[1] + 2 * oneMinusT * t * c[1] + t * t * b[1],
    ];
  }

  private toArcLengthT(
    progress: number,
    a: Readonly<number[]>,
    c: Readonly<number[]>,
    b: Readonly<number[]>,
  ): number {
    const samples = this.arcLengthSamples;
    const cumulative = new Array(samples + 1).fill(0);
    let totalLength = 0;
    let prev = this.bezierPoint(0, a, c, b);

    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const curr = this.bezierPoint(t, a, c, b);
      totalLength += Math.hypot(curr[0] - prev[0], curr[1] - prev[1]);
      cumulative[i] = totalLength;
      prev = curr;
    }

    if (totalLength <= Number.EPSILON) {
      return progress;
    }

    const targetLength = progress * totalLength;
    for (let i = 1; i <= samples; i++) {
      if (cumulative[i] < targetLength) {
        continue;
      }
      const segStart = cumulative[i - 1];
      const segEnd = cumulative[i];
      const segLength = segEnd - segStart;
      const local =
        segLength <= Number.EPSILON ? 0 : (targetLength - segStart) / segLength;
      return (i - 1 + local) / samples;
    }

    return 1;
  }
}
