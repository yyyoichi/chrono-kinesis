export type ActivityTransitionState = {
  current: number;
  started: boolean;
  stopped: boolean;
};

export type ActivityTransitionOptions = {
  // 開始判定するしきい値です。
  // デフォルトで0.5に設定されます。
  startThreshold?: number;
  // 停止判定するしきい値です。
  // デフォルトで0.5に設定されます。
  stopThreshold?: number;
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
    };
  }
}
