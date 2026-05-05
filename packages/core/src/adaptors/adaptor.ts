import type {
  GateReadablePort,
  PositionReadablePort,
  ProgressReadablePort,
  ScalarReadablePort,
  SizeReadablePort,
  SnapshotPort,
  TriggerReadablePort,
  VectorReadablePort,
} from "../ports";

export class VectorAdapter implements VectorReadablePort {
  private value: () => [number];
  private _snapshot: [number];
  constructor(
    private source:
      | GateReadablePort
      | ProgressReadablePort
      | TriggerReadablePort
      | ScalarReadablePort,
  ) {
    this.value =
      "gate" in source
        ? () => [source.gate]
        : "progress" in source
          ? () => [source.progress]
          : "trigger" in source
            ? () => [source.trigger]
            : () => [source.scalar];
    this._snapshot = this.value();
  }
  public snapshot(): void {
    const value = this.value();
    if (this._snapshot[0] !== value[0]) {
      this._snapshot = value;
    }
  }
  public vector(): Readonly<number[]> {
    return this._snapshot;
  }
  public dependencies(): SnapshotPort[] {
    return [this.source];
  }
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

type LinearScaledVectorOptions = {
  min?: number;
  max?: number;
};

export class LinearScaledVector implements VectorReadablePort {
  private _snapshot: number[] = [];
  private source: SnapshotPort;
  private value: () => number;
  private scales: Array<{ min: number; max: number }> = [];
  constructor(
    source: GateReadablePort | ProgressReadablePort | TriggerReadablePort,
    ...options: Array<LinearScaledVectorOptions>
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
