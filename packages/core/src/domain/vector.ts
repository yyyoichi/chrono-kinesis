import type {
  GateReadablePort,
  PositionReadablePort,
  ProgressReadablePort,
  SizeReadablePort,
  SnapshotPort,
  TriggerReadablePort,
  VectorReadablePort,
} from "./ports";

export class VectorComposer implements VectorReadablePort {
  private _snapshot: number[] = [];
  private sources: VectorReadablePort[];
  constructor(...sources: VectorReadablePort[]) {
    this.sources = sources;
    this.snapshot();
  }
  public vector(): Readonly<number[]> {
    return this._snapshot;
  }
  public snapshot(): void {
    const vector = this.sources.reduce((acc, source) => {
      const v = source.vector();
      return acc.concat(v);
    }, [] as number[]);
    this._snapshot = vector;
  }
  public dependencies(): SnapshotPort[] {
    return this.sources;
  }
}

export class VectorAdapter implements VectorReadablePort {
  private value: () => number[];
  constructor(private source: GateReadablePort | ProgressReadablePort | TriggerReadablePort) {
    this.value =
      "gate" in source
        ? () => [source.gate]
        : "progress" in source
          ? () => [source.progress]
          : () => [source.trigger];
  }
  public snapshot(): void {}
  public vector(): Readonly<number[]> {
    return this.value();
  }
  public dependencies(): SnapshotPort[] {
    return [this.source];
  }
}

type LinearScaledVectorOptions = {
  min: number;
  max: number;
};

export class LinearScaledVector implements VectorReadablePort {
  private _snapshot: number[] = [];
  private source: SnapshotPort;
  private value: () => number;
  private scales: Array<LinearScaledVectorOptions> = [];
  constructor(
    source: GateReadablePort | ProgressReadablePort | TriggerReadablePort,
    ...options: Array<Partial<LinearScaledVectorOptions>>
  ) {
    this.source = source;
    this.value =
      "gate" in source
        ? () => source.gate
        : "progress" in source
          ? () => source.progress
          : () => source.trigger;
    for (const option of options) {
      this.scales.push({
        min: option.min ?? 0,
        max: option.max ?? 1,
      });
    }
    this.snapshot();
  }
  public snapshot(): void {
    const v = this.value();
    this._snapshot = this.scales.map(({ min, max }) => v * (max - min) + min);
  }
  public vector(): Readonly<number[]> {
    return this._snapshot;
  }
  public dependencies(): SnapshotPort[] {
    return [this.source];
  }
}

export class CenteredPosition implements PositionReadablePort, VectorReadablePort {
  private _snapshot: [number, number] = [0, 0];
  constructor(private readonly source: SizeReadablePort & PositionReadablePort) {
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

type OffsetPositionOptions = {
  leftPx?: number;
  topPx?: number;
};

export class OffsetPosition implements PositionReadablePort, VectorReadablePort {
  private readonly leftPx: number;
  private readonly topPx: number;
  private _snapshot: [number, number] = [0, 0];

  constructor(
    private readonly source: PositionReadablePort,
    options: OffsetPositionOptions = {},
  ) {
    this.leftPx = options.leftPx ?? 0;
    this.topPx = options.topPx ?? 0;
    this.snapshot();
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

type TriggerToggleReducerOptions = {
  initGate?: 0 | 1;
};

// 単一トリガーをスイッチのように扱い、trigger=1のたびにGateを反転します。
// trigger=0は無視します。
export class TriggerToggleReducer implements GateReadablePort {
  private _snapshot: 0 | 1;

  constructor(
    private readonly triggerInput: TriggerReadablePort,
    options: TriggerToggleReducerOptions = {},
  ) {
    this._snapshot = options.initGate ?? 0;
  }

  public snapshot(): void {
    if (this.triggerInput.trigger === 0) {
      return;
    }
    this._snapshot = this._snapshot === 1 ? 0 : 1;
  }

  public get gate() {
    return this._snapshot;
  }

  public dependencies(): SnapshotPort[] {
    return [this.triggerInput];
  }
}

type TriggerGateReducerOptions = {
  initGate?: 0 | 1;
};

// ２つのトリガーを組み合わせてGateを生成します。
// 同時発火時はOFFが優先します。
export class TriggerGateReducer implements GateReadablePort {
  private _snapshot: 0 | 1;

  constructor(
    private readonly onTrigger: TriggerReadablePort,
    private readonly offTrigger: TriggerReadablePort,
    options: TriggerGateReducerOptions = {},
  ) {
    this._snapshot = options.initGate ?? 0;
  }

  public snapshot(): void {
    if (this.onTrigger.trigger === 1 && this._snapshot === 0) {
      this._snapshot = 1;
    }
    if (this.offTrigger.trigger === 1 && this._snapshot === 1) {
      this._snapshot = 0;
    }
  }

  public get gate() {
    return this._snapshot;
  }

  public dependencies(): SnapshotPort[] {
    return [this.onTrigger, this.offTrigger];
  }
}

type ArcPositionOptions = {
  arcHeight?: number;
  apexProgress?: number;
  parameterization?: "parametric" | "arc-length";
  arcLengthSamples?: number;
};

class ArcPosition implements PositionReadablePort, VectorReadablePort {
  private readonly arcHeight?: number;
  private readonly apexProgress: number;
  private readonly parameterization: "parametric" | "arc-length";
  private readonly arcLengthSamples: number;

  private _snapshot: [number, number] = [0, 0];

  constructor(
    private readonly pointA: PositionReadablePort,
    private readonly pointB: PositionReadablePort,
    private readonly progress: ProgressReadablePort,
    options: ArcPositionOptions = {},
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
  public position(): Readonly<[number, number]> {
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
    const x = oneMinusT * oneMinusT * a[0] + 2 * oneMinusT * t * controlX + t * t * b[0];
    const y = oneMinusT * oneMinusT * a[1] + 2 * oneMinusT * t * controlY + t * t * b[1];
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
      const local = segLength <= Number.EPSILON ? 0 : (targetLength - segStart) / segLength;
      return (i - 1 + local) / samples;
    }

    return 1;
  }
}
