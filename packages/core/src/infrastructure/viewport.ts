import {
  BaseClock,
  type ClockPort,
  type DisposablePort,
  type SizeReadablePort,
  type TriggerReadablePort,
} from "../domain";
import { WindowResizeTriggerClock } from "./clock-dom";

interface ResizeTriggerPort
  extends ClockPort,
    TriggerReadablePort,
    SizeReadablePort,
    DisposablePort {}

type ViewportThresholdOptions = {
  threshold: number;
  triggerDirection?: "forward" | "backward" | "both";
  // デフォルトでwindowのviewportを利用します。
  viewportSignal: ViewportSignal;
  // windowのリサイズを監視するためのsignal。デフォルトでwindowResizeSignalを利用します。
  // viewportとしてwindow以外を利用する場合、resizeSignalも同じViewportのリサイズClockを指定する必要があります。
  resizeTrigger: ResizeTriggerPort;
};

// DomがViewportの特定の位置を超えたら1tickだけtrigger=1を出すClock
export class ViewportTriggerClock extends BaseClock implements ClockPort, TriggerReadablePort {
  private static readonly SENTINEL_HOST_CLASS = "ck-viewport-trigger-host";
  // 監視対象のトリガー位置設定
  private thresholdRatio = 0;
  // forward: 画面下部を上から下に交差でトリガー、backward: 画面下部を下から上に交差でトリガー、both: どちらの交差でもトリガー
  private triggerDirection: "forward" | "backward" | "both" = "forward";
  private viewportSignal: ViewportSignal;
  private resizeTrigger: ResizeTriggerPort;
  // resizeTriggerが内部で初期化されたかどうか。
  // 内部で初期化された場合、ViewportTriggerClockのdestroy()でresizeTriggerもdestroy()する必要がある。
  private ownResizeTrigger: boolean;

  private _snapshot: 0 | 1 = 0; // 0 or 1
  private state: 0 | 1 = 0;

  private host: HTMLElement;
  private target: HTMLElement;
  // Viewport以外の要素枠内での交差を監視する。targetは交差を監視したい要素。
  public static newWithElementViewport(target: HTMLElement, options: ViewportThresholdOptions) {
    return new ViewportTriggerClock(target, options);
  }
  // Windowのviewport交差を監視する。targetは交差を監視したい要素。
  public static newWithWindowViewport(
    target: HTMLElement,
    options: Partial<Pick<ViewportThresholdOptions, "threshold" | "triggerDirection">> = {},
  ) {
    return new ViewportTriggerClock(target, {
      threshold: options.threshold ?? 0,
      triggerDirection: options.triggerDirection ?? "forward",
    });
  }
  constructor(target: HTMLElement, options: Partial<ViewportThresholdOptions> = {}) {
    super();
    if (options.threshold !== undefined) {
      this.thresholdRatio = Math.max(0, Math.min(1, options.threshold));
    }
    if (options.triggerDirection) {
      this.triggerDirection = options.triggerDirection;
    }

    this.viewportSignal = options.viewportSignal || getDefaultViewportSignal();
    this.resizeTrigger = options.resizeTrigger || new WindowResizeTriggerClock();
    this.ownResizeTrigger = typeof options.resizeTrigger === "undefined";

    // user target > host(relative, class) > sentinel(absolute)
    this.host = ViewportTriggerClock.ensureSentinelHost(target);
    this.target = ViewportTriggerClock.createTarget();
    this.host.appendChild(this.target);

    this.updateThresholdOffset();
    this.snapshot();
    this.viewportSignal.subscribe(this.target, this.triggerHeartbeat.bind(this));
  }
  // 同じ要素に対してクロックを作成する。
  public newClock(
    options: Pick<Partial<ViewportThresholdOptions>, "threshold" | "triggerDirection"> = {},
  ) {
    return new ViewportTriggerClock(this.host, {
      threshold: options.threshold ?? this.thresholdRatio,
      triggerDirection: options.triggerDirection ?? this.triggerDirection,
      viewportSignal: this.viewportSignal,
      resizeTrigger: this.resizeTrigger,
    });
  }
  public snapshot(): void {
    this._snapshot = this.state;
    this.state = 0;
    if (this.resizeTrigger.trigger === 1) {
      this.updateThresholdOffset();
    }
  }
  public get trigger() {
    return this._snapshot;
  }
  public destroy() {
    this.viewportSignal.unsubscribe(this.target);
    this.target.remove();
    if (this.ownResizeTrigger) {
      this.resizeTrigger.destroy();
    }
  }
  public dependencies() {
    return [this.resizeTrigger];
  }

  // 交差イベントを1tick triggerとして通知する。
  private triggerHeartbeat(direction?: ViewportCrossDirection) {
    if (this.triggerDirection === direction || this.triggerDirection === "both") {
      this.state = 1;
      this._heartbeat();
    }
  }
  // thresholdの位置を更新して移動させる。
  private updateThresholdOffset() {
    // viewport下端からの距離を計算
    const vh = this.resizeTrigger.size()[1];
    const threshold = this.thresholdRatio * vh;
    const offset = Math.round(threshold * 10) / 10;
    // translate等で監視要素の位置を物理的にズラす
    this.target.style.transform = `translateY(${offset}px)`;
  }

  private static ensureSentinelHost(target: HTMLElement) {
    if (target.classList.contains(ViewportTriggerClock.SENTINEL_HOST_CLASS)) {
      return target;
    }

    const existingHost = target.querySelector<HTMLElement>(
      `:scope > .${ViewportTriggerClock.SENTINEL_HOST_CLASS}`,
    );
    if (existingHost) {
      return existingHost;
    }

    const host = document.createElement("div");
    host.classList.add(ViewportTriggerClock.SENTINEL_HOST_CLASS);
    host.style.position = "relative";
    host.style.pointerEvents = "none";
    target.insertAdjacentElement("afterbegin", host);
    return host;
  }
  private static createTarget() {
    const target = document.createElement("div");
    target.style.position = "absolute";
    target.style.left = "0";
    target.style.top = "0";
    target.style.width = "1px";
    target.style.height = "1px";
    return target;
  }
}

let viewportSignal: ViewportSignal | null = null;
export function getDefaultViewportSignal() {
  if (!viewportSignal) {
    viewportSignal = new ViewportSignal();
  }
  return viewportSignal;
}

export function subscribeDefaultViewport(...arg: Parameters<ViewportSignal["subscribe"]>) {
  getDefaultViewportSignal().subscribe(...arg);
}

type ViewportCrossDirection = "forward" | "backward";
type ViewportCrossCallback = (direction: ViewportCrossDirection) => void;

export class ViewportSignal {
  private observer: IntersectionObserver | null = null;
  private handlers = new Map<Element, ViewportCrossCallback>();
  private initializedTargets = new Set<Element>();
  private previousTopByTarget = new Map<Element, number>();
  constructor(private options: IntersectionObserverInit = {}) {}
  public subscribe(target: Element, callback: ViewportCrossCallback) {
    this.handlers.set(target, callback);
    this.ensureObserver().observe(target);
  }
  public unsubscribe(target: Element) {
    this.handlers.delete(target);
    this.initializedTargets.delete(target);
    this.previousTopByTarget.delete(target);
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
          const currentTop = entry.boundingClientRect.top;
          const rootBottom = entry.rootBounds?.bottom ?? window.innerHeight;

          if (!this.initializedTargets.has(target)) {
            this.initializedTargets.add(target);
            this.previousTopByTarget.set(target, currentTop);
            // 初期位置がすでにしきい値を超えていた場合はforwardを発火する。
            // ブラウザバックなどでスクロール位置が復元された場合を想定。
            if (currentTop <= rootBottom) {
              this.handlers.get(target)?.("forward");
            }
            continue;
          }

          const previousTop = this.previousTopByTarget.get(target) ?? currentTop;
          this.previousTopByTarget.set(target, currentTop);

          const direction: ViewportCrossDirection =
            currentTop < previousTop ? "forward" : "backward";

          const crossedBottomLine =
            (previousTop > rootBottom && currentTop <= rootBottom) || // 画面下部を上から下に交差で発火
            (previousTop <= rootBottom && currentTop > rootBottom); // 画面下部を下から上に交差で発火
          if (!crossedBottomLine) {
            continue;
          }
          this.handlers.get(target)?.(direction);
        }
      },
      // 画面下部と交差で発火
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
