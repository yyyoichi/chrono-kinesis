import type {
  GateReadablePort,
  PositionReadablePort,
  ProgressReadablePort,
  RatioReadablePort,
  ScalarReadablePort,
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

/** number | RatioReadablePort を () => number に解決するヘルパー。
 * 数値の場合はコンストラクタ時に 0〜1 へ clamp して固定クロージャを返します。
 * RatioReadablePort の場合はポートを返し、snapshot ごとに ratio を読みます。
 */
function resolveRatio(
  raw: number | RatioReadablePort | undefined,
  fallback = 0.5,
): { getter: () => number; port: RatioReadablePort | null } {
  if (raw && typeof raw === "object") {
    return { getter: () => raw.ratio, port: raw };
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const clamped = Math.max(0, Math.min(1, raw));
    return { getter: () => clamped, port: null };
  }
  if (Number.isFinite(fallback)) {
    const clamped = Math.max(0, Math.min(1, fallback));
    return { getter: () => clamped, port: null };
  }
  return { getter: () => 0, port: null };
}

export class ScalarAdapter implements ScalarReadablePort {
  private _snapshot = 0;
  private readonly value: () => number;
  private readonly _dependencies: SnapshotPort[];

  public static fromSizeW(source: SizeReadablePort): ScalarAdapter {
    return new ScalarAdapter(source, "w");
  }

  public static fromSizeH(source: SizeReadablePort): ScalarAdapter {
    return new ScalarAdapter(source, "h");
  }

  public static fromPositionX(source: PositionReadablePort): ScalarAdapter {
    return new ScalarAdapter(source, "x");
  }

  public static fromPositionY(source: PositionReadablePort): ScalarAdapter {
    return new ScalarAdapter(source, "y");
  }

  private constructor(
    source: SizeReadablePort | PositionReadablePort,
    axis: "w" | "h" | "x" | "y",
  ) {
    this.value =
      "size" in source
        ? () => {
            const [width, height] = source.size();
            return axis === "h" ? height : width;
          }
        : () => {
            const [x, y] = source.position();
            return axis === "y" ? y : x;
          };
    this._dependencies = [source];
    this.snapshot();
  }

  public snapshot(): void {
    this._snapshot = this.value();
  }

  public get scalar(): number {
    return this._snapshot;
  }

  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }
}

type ScalarThresholdRatioOptions = {
  /** 昇順しきい値。例: [600, 1024] */
  thresholds: number[];
  /** しきい値区間ごとの ratio。length は thresholds.length + 1 */
  ratios: number[];
};

export class ScalarThresholdRatio implements RatioReadablePort {
  private _snapshot = 0;
  private readonly thresholds: Readonly<number[]>;
  private readonly ratios: Readonly<number[]>;
  private readonly _dependencies: SnapshotPort[];

  constructor(
    private readonly source: ScalarReadablePort,
    options: ScalarThresholdRatioOptions,
  ) {
    this.thresholds = [...options.thresholds];
    this.ratios = options.ratios.map((x) => {
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

/** 矩形の左上座標と幅高さから、矩形の中心点を返します */
export class BoxCenterPosition implements PositionReadablePort, VectorReadablePort {
  private readonly source: BoxRelativePosition;
  constructor(
    private readonly positionSource: PositionReadablePort, // 矩形の左上座標
    private readonly sizeSource: SizeReadablePort,
  ) {
    this.source = new BoxRelativePosition(this.positionSource, this.sizeSource, {
      x: 0.5,
      y: 0.5,
    });
  }
  public snapshot() {
    this.source.snapshot();
  }
  public position(): Readonly<[number, number]> {
    return this.source.position();
  }
  public vector(): Readonly<number[]> {
    return this.source.vector();
  }
  public dependencies(): SnapshotPort[] {
    return this.source.dependencies();
  }
}

type BoxRelativePositionOptions = {
  /** x方向の位置（rate）。0=左端, 0.5=中央, 1.0=右端。デフォルトは0.5。数値固定またはRatioReadablePortで動的に指定できます。 */
  x?: number | RatioReadablePort;
  /** y方向の位置（rate）。0=上端, 0.5=中央, 1.0=下端。デフォルトは0.5。数値固定またはRatioReadablePortで動的に指定できます。 */
  y?: number | RatioReadablePort;
};

/** 矩形の左上座標と幅高さから、任意の相対位置（rate: 0〜1）を返します。
 * x=0.5, y=0.5 で BoxCenterPosition と等価になります。
 * x/y に RatioReadablePort を渡すと snapshot ごとに動的な rate を使えます。
 */
export class BoxRelativePosition implements PositionReadablePort, VectorReadablePort {
  private _snapshot: [number, number] = [0, 0];
  private readonly getXRatio: () => number;
  private readonly getYRatio: () => number;
  private readonly _dependencies: SnapshotPort[];

  constructor(
    private readonly positionSource: PositionReadablePort,
    private readonly sizeSource: SizeReadablePort,
    options: BoxRelativePositionOptions = {},
  ) {
    const { getter: getX, port: xPort } = resolveRatio(options.x);
    const { getter: getY, port: yPort } = resolveRatio(options.y);
    const ratioPorts = [xPort, yPort].filter((p): p is RatioReadablePort => p !== null);
    this.getXRatio = getX;
    this.getYRatio = getY;
    this._dependencies = [positionSource, sizeSource, ...ratioPorts];
    this.snapshot();
  }

  public snapshot() {
    const [x, y] = this.positionSource.position();
    const [width, height] = this.sizeSource.size();
    this._snapshot = [x + width * this.getXRatio(), y + height * this.getYRatio()];
  }

  public position(): Readonly<[number, number]> {
    return this._snapshot;
  }

  public vector(): Readonly<number[]> {
    return this._snapshot;
  }

  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }
}

/** 指定した点を中心として、矩形サイズ分オフセットした左上座標を返します。
 * 要素のポインタ追従や中央配置のターゲット計算に使います。
 */
export class CenterAlignedPosition implements PositionReadablePort, VectorReadablePort {
  private readonly source: RelativeAlignedPosition;

  constructor(
    private readonly positionSource: PositionReadablePort, // 中心に来てほしい点
    private readonly sizeSource: SizeReadablePort, // 配置する矩形
  ) {
    this.source = new RelativeAlignedPosition(this.positionSource, this.sizeSource, {
      x: 0.5,
      y: 0.5,
    });
  }

  public snapshot() {
    this.source.snapshot();
  }

  public position(): Readonly<[number, number]> {
    return this.source.position();
  }

  public vector(): Readonly<number[]> {
    return this.source.vector();
  }

  public dependencies(): SnapshotPort[] {
    return this.source.dependencies();
  }
}

type RelativeAlignedPositionOptions = {
  /** x方向の位置（rate）。0=左端, 0.5=中央, 1.0=右端。デフォルトは0.5。数値固定またはRatioReadablePortで動的に指定できます。 */
  x?: number | RatioReadablePort;
  /** y方向の位置（rate）。0=上端, 0.5=中央, 1.0=下端。デフォルトは0.5。数値固定またはRatioReadablePortで動的に指定できます。 */
  y?: number | RatioReadablePort;
};

/** 指定した点を基準として、矩形サイズ分オフセットした左上座標を返します。
 * x=0.5, y=0.5 で CenterAlignedPosition と等価になります。
 * x/y に RatioReadablePort を渡すと snapshot ごとに動的な rate を使えます。
 */
export class RelativeAlignedPosition implements PositionReadablePort, VectorReadablePort {
  private _snapshot: [number, number] = [0, 0];
  private readonly getXRatio: () => number;
  private readonly getYRatio: () => number;
  private readonly _dependencies: SnapshotPort[];

  constructor(
    private readonly positionSource: PositionReadablePort,
    private readonly sizeSource: SizeReadablePort,
    options: RelativeAlignedPositionOptions = {},
  ) {
    const { getter: getX, port: xPort } = resolveRatio(options.x);
    const { getter: getY, port: yPort } = resolveRatio(options.y);
    const ratioPorts = [xPort, yPort].filter((p): p is RatioReadablePort => p !== null);
    this.getXRatio = getX;
    this.getYRatio = getY;
    this._dependencies = [positionSource, sizeSource, ...ratioPorts];
    this.snapshot();
  }

  public snapshot() {
    const [x, y] = this.positionSource.position();
    const [width, height] = this.sizeSource.size();
    this._snapshot = [x - width * this.getXRatio(), y - height * this.getYRatio()];
  }

  public position(): Readonly<[number, number]> {
    return this._snapshot;
  }

  public vector(): Readonly<number[]> {
    return this._snapshot;
  }

  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }
}

export class FixedPosition implements VectorReadablePort, PositionReadablePort {
  private _snapshot: Readonly<[number, number]> = [0, 0];
  constructor(position: ReturnType<PositionReadablePort["position"]>) {
    this._snapshot = [...position];
  }
  public snapshot(): void {}
  public position(): Readonly<[number, number]> {
    return this._snapshot;
  }
  public vector(): Readonly<number[]> {
    return this._snapshot;
  }
}

type OffsetPositionOptions = {
  /** 左方向オフセット(px)。固定値 or ScalarReadablePort。 */
  leftPx?: number | ScalarReadablePort;
  /** 上方向オフセット(px)。固定値 or ScalarReadablePort。 */
  topPx?: number | ScalarReadablePort;
};

function resolveScalar(
  raw: number | ScalarReadablePort | undefined,
  fallback = 0,
): { getter: () => number; port: ScalarReadablePort | null } {
  if (raw && typeof raw === "object") {
    return { getter: () => raw.scalar, port: raw };
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { getter: () => raw, port: null };
  }
  if (Number.isFinite(fallback)) {
    return { getter: () => fallback, port: null };
  }
  return { getter: () => 0, port: null };
}

export class OffsetPosition implements PositionReadablePort, VectorReadablePort {
  private readonly getLeftPx: () => number;
  private readonly getTopPx: () => number;
  private readonly _dependencies: SnapshotPort[];
  private _snapshot: [number, number] = [0, 0];

  constructor(
    private readonly source: PositionReadablePort,
    options: OffsetPositionOptions = {},
  ) {
    const { getter: getLeftPx, port: leftPort } = resolveScalar(options.leftPx);
    const { getter: getTopPx, port: topPort } = resolveScalar(options.topPx);
    this.getLeftPx = getLeftPx;
    this.getTopPx = getTopPx;
    const scalarPort = [leftPort, topPort].filter((p): p is ScalarReadablePort => p !== null);
    this._dependencies = [this.source, ...scalarPort];
    this.snapshot();
  }

  public snapshot(): void {
    const [x, y] = this.source.position();
    this._snapshot = [x + this.getLeftPx(), y + this.getTopPx()];
  }
  public position(): Readonly<[number, number]> {
    return this._snapshot;
  }
  public vector(): Readonly<number[]> {
    return this._snapshot;
  }
  public dependencies(): SnapshotPort[] {
    return this._dependencies;
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

export class GateConditionalVector implements VectorReadablePort {
  private _snapshot: Readonly<number[]> = [];
  constructor(
    private readonly gate: GateReadablePort,
    private readonly trueVector: VectorReadablePort,
    private readonly falseVector: VectorReadablePort,
  ) {
    this.snapshot();
  }
  public snapshot(): void {
    const gateValue = this.gate.gate;
    this._snapshot = gateValue === 1 ? this.trueVector.vector() : this.falseVector.vector();
  }
  public vector(): Readonly<number[]> {
    return this._snapshot;
  }
  public dependencies(): SnapshotPort[] {
    return [this.gate, this.trueVector, this.falseVector];
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
