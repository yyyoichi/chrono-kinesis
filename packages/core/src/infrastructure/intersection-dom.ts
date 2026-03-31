import { BaseClock, type TriggerReadablePort } from "../domain";

type IntersectionTriggerClockOptions = {
  orientation?: IntersectionOrientation;
  // 交差方向
  direction?: IntersectionCrossDirection | "both";
  // 交差ルート
  root?: Element | Document;
};

/**
 * targetの要素の交差をTriggerReadablePortとして提供するクロック。
 * options.rootを使用しない場合、ビューポートとの交差を監視します。
 * @param target 交差を監視する要素
 * @param options 交差のオプション
 * @param options.orientation 交差の方向。垂直方向("vertical")か水平方向("horizontal")を指定。デフォルトは"vertical"。
 * @param options.direction 交差方向。要素が交差する方向を指定。"forward"は要素が画面内に入るとき、"backward"は要素が画面から出るとき、"both"は両方の場合にトリガーされます。デフォルトは"forward"。
 * @param options.root 交差を監視するルート要素。デフォルトはビューポート(document)。
 */
export class IntersectionTriggerClock extends BaseClock implements TriggerReadablePort {
  private readonly direction: IntersectionCrossDirection | "both";
  private readonly signal: IntersectionSignal;
  private state: 0 | 1 = 0; // crossが発生したか
  private _snapshot: 0 | 1 = 0;
  constructor(
    private readonly target: Element,
    options: IntersectionTriggerClockOptions = {},
  ) {
    super();
    this.direction = options.direction ?? "forward";
    this.signal = getSignal(options.root);
    this.signal.subscribe(target, this.triggerHeartbeat, options.orientation);
  }
  public snapshot(): void {
    this._snapshot = this.state;
    this.state = 0;
  }
  public get trigger() {
    return this._snapshot;
  }
  public destroy(): void {
    this.signal.unsubscribe(this.target);
  }
  // 交差イベントコールバック。
  private triggerHeartbeat: IntersectionCrossCallback = (direction) => {
    if (this.direction === "both" || this.direction === direction) {
      this.state = 1;
      this._heartbeat();
    }
  };
}

type IntersectionOrientation = "vertical" | "horizontal";
type IntersectionCrossDirection = "forward" | "backward";
type IntersectionCrossCallback = (direction: IntersectionCrossDirection) => void;

class IntersectionSignal {
  private observer: IntersectionObserver | null = null;
  private handlers = new Map<Element, IntersectionCrossCallback>();
  private orientations = new Map<Element, IntersectionOrientation>();
  private initializedTargets = new Set<Element>();
  private previousPosByTarget = new Map<Element, number>();

  constructor(private options: IntersectionObserverInit = {}) {}
  public subscribe(
    target: Element,
    callback: IntersectionCrossCallback,
    orientation: IntersectionOrientation = "vertical",
  ) {
    this.handlers.set(target, callback);
    this.orientations.set(target, orientation);
    this.ensureObserver().observe(target);
  }
  public unsubscribe(target: Element) {
    this.handlers.delete(target);
    this.orientations.delete(target);
    this.initializedTargets.delete(target);
    this.previousPosByTarget.delete(target);
    if (this.observer) {
      this.observer.unobserve(target);
    }
    if (this.handlers.size === 0 && this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
  private ensureObserver(): IntersectionObserver {
    if (this.observer) {
      return this.observer;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = entry.target;
          const orientation = this.orientations.get(target) ?? "vertical";
          const isVertical = orientation === "vertical";
          const currentPos = isVertical
            ? entry.boundingClientRect.top
            : entry.boundingClientRect.left;
          const rootEnd = isVertical
            ? (entry.rootBounds?.bottom ?? window.innerHeight)
            : (entry.rootBounds?.right ?? window.innerWidth);

          if (!this.initializedTargets.has(target)) {
            this.initializedTargets.add(target);
            this.previousPosByTarget.set(target, currentPos);
            // 初期位置がすでにしきい値を超えていた場合はforwardを発火する。
            if (currentPos <= rootEnd) {
              this.handlers.get(target)?.("forward");
            }
            continue;
          }

          const previousPos = this.previousPosByTarget.get(target) ?? currentPos;
          this.previousPosByTarget.set(target, currentPos);

          const direction: IntersectionCrossDirection =
            currentPos < previousPos ? "forward" : "backward";

          const crossedLine =
            (previousPos > rootEnd && currentPos <= rootEnd) || // 境界を外から内に交差
            (previousPos <= rootEnd && currentPos > rootEnd); // 境界を内から外に交差
          if (!crossedLine) {
            continue;
          }
          this.handlers.get(target)?.(direction);
        }
      },
      // 画面端と交差で発火
      {
        root: null,
        rootMargin: "0px",
        threshold: 0,
        ...this.options,
      },
    );
    return this.observer;
  }
}

const signalByRoot = new WeakMap<Element | Document, IntersectionSignal>();

function getSignal(root: Element | Document = document) {
  let signal = signalByRoot.get(root);
  if (!signal) {
    signal = new IntersectionSignal({ root: root });
    signalByRoot.set(root, signal);
  }
  return signal;
}
