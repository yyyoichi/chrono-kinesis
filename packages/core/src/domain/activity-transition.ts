export type ActivityTransitionState = {
  current: number;
  started: boolean;
  stopped: boolean;
  active: boolean;
};

export type ActivityTransitionOptions = {
  // 開始判定するしきい値です。
  // デフォルトで0.5に設定されます。
  startThreshold?: number;
  // 停止判定するしきい値です。
  // デフォルトで0.5に設定されます。
  stopThreshold?: number;
  // 初期のactivity levelです。デフォルトで0です。
  initialLevel?: number;
  // 初期のactive状態です。未指定の場合はinitialLevelとstartThresholdから自動判定されます。
  initialState?: "active" | "inactive";
};

/**
 * ActivityTransitionは、アクティビティレベルの変化に基づいて、開始・停止判定を行います。
 * 内部で前回のアクティビティレベルを保持し、現在のレベルと比較して状態を返します。
 * しきい値はKineticsに設定するしきい値（Kinetics.ACTIVITY_THRESHOLD）よりも大きくする必要があります。
 */
export class ActivityTransition {
  private current: number = 0;
  private active: boolean = false;

  private readonly startThreshold: number;
  private readonly stopThreshold: number;

  constructor(options: ActivityTransitionOptions = {}) {
    this.startThreshold = Math.max(
      0,
      Number.isFinite(options.startThreshold) ? (options.startThreshold as number) : 0.5,
    );
    this.stopThreshold = Math.max(
      0,
      Number.isFinite(options.stopThreshold) ? (options.stopThreshold as number) : 0.5,
    );
    if (this.startThreshold < this.stopThreshold) {
      throw new Error("startThreshold must be greater than or equal to stopThreshold.");
    }

    this.reset(options.initialLevel ?? 0, options.initialState);
  }

  public update(level: number): ActivityTransitionState {
    if (!Number.isFinite(level)) {
      throw new Error("level must be a finite number.");
    }

    const wasActive = this.active;
    this.current = Math.max(0, level);

    const started = !wasActive && this.current >= this.startThreshold;
    const stopped = wasActive && this.current < this.stopThreshold;

    if (started) {
      this.active = true;
    } else if (stopped) {
      this.active = false;
    }

    return {
      current: this.current,
      started,
      stopped,
      active: this.active,
    };
  }

  public reset(initialLevel: number = 0, initialState?: "active" | "inactive"): void {
    if (!Number.isFinite(initialLevel)) {
      throw new Error("initialLevel must be a finite number.");
    }
    const level = Math.max(0, initialLevel);

    if (initialState === "active" && level < this.stopThreshold) {
      throw new Error("initialState=active is invalid when initialLevel is below stopThreshold.");
    }
    if (initialState === "inactive" && level >= this.startThreshold) {
      throw new Error(
        "initialState=inactive is invalid when initialLevel is greater than or equal to startThreshold.",
      );
    }

    this.current = level;
    this.active =
      initialState === undefined ? level >= this.startThreshold : initialState === "active";
  }

  public state(): ActivityTransitionState {
    return {
      current: this.current,
      started: false,
      stopped: false,
      active: this.active,
    };
  }
}
