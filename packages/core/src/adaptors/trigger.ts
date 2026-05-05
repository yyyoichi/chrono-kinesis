import type { GateReadablePort, SnapshotPort, TriggerReadablePort } from "../ports";

/**
 * 複数のトリガーを理論演算で還元します。
 * @param op OR...いずれかのトリガーが発火していれば trigger=1, AND...すべてのトリガーが発火していれば trigger=1
 * @param sources 還元するトリガーの配列。sourcesが空の場合は常に trigger=0 になります。
 */
export class TriggerReducer implements TriggerReadablePort {
  private readonly reduce: () => boolean;
  private readonly _dependencies: SnapshotPort[];
  private _snapshot: 0 | 1 = 0;
  constructor(op: "OR" | "AND", ...sources: TriggerReadablePort[]) {
    if (sources.length === 0) {
      this.reduce = () => false;
      this._dependencies = [];
      this._snapshot = 0;
      return;
    }
    if (op === "OR") {
      this.reduce = () => sources.some((s) => s.trigger === 1);
    } else {
      this.reduce = () => sources.every((s) => s.trigger === 1);
    }
    this._dependencies = sources;
    this.snapshot();
  }
  public snapshot(): void {
    this._snapshot = this.reduce() ? 1 : 0;
  }
  public get trigger(): Readonly<0 | 1> {
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
