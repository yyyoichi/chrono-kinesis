import {
  BaseClock,
  type ClockPort,
  type DisposablePort,
  type GateReadablePort,
  type PositionReadablePort,
  type SizeReadablePort,
  type SnapshotPort,
  type TriggerReadablePort,
  type VectorReadablePort,
} from "../domain";

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

export class WindowResizeTriggerClock
  extends BaseClock
  implements ClockPort, TriggerReadablePort, SizeReadablePort
{
  private _snapshot: {
    trigger: 0 | 1;
    width: number; // vw
    height: number; // vh
  } = {
    trigger: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
  private state:
    | {
        trigger: 0;
      }
    | {
        trigger: 1;
        width: number;
        height: number;
      } = { trigger: 0 };
  constructor() {
    super();
    windowResizeSignal.subscribe(this.onResize);
  }
  public snapshot(): void {
    if (this.state.trigger === 0) {
      this._snapshot.trigger = 0;
      return;
    }
    this._snapshot = this.state;
    this.state = { trigger: 0 };
  }
  public get trigger() {
    return this._snapshot.trigger;
  }
  public size(): Readonly<[number, number]> {
    return [this._snapshot.width, this._snapshot.height];
  }
  public destroy(): void {
    windowResizeSignal.unsubscribe(this.onResize);
  }
  private onResize = (w: WindowProxy) => {
    this.state = {
      trigger: 1,
      width: w.innerWidth,
      height: w.innerHeight,
    };
    this._heartbeat();
  };
}

type ResizeTriggerClockOptions = {
  signal: ElementResizeSignal;
};

// Domの特定の要素のリサイズを監視するClock
// 一つのDomに対して一つのElementResizeTriggerClockのみが有効です。
export class ElementResizeTriggerClock
  extends BaseClock
  implements ClockPort, TriggerReadablePort, SizeReadablePort, DisposablePort
{
  private _snapshot: {
    trigger: 0 | 1;
    width: number;
    height: number;
  } = {
    trigger: 0,
    width: 0,
    height: 0,
  };
  private state:
    | {
        trigger: 0;
      }
    | {
        trigger: 1;
        width: number;
        height: number;
      } = { trigger: 0 };
  private signal: ElementResizeSignal;
  constructor(
    private target: Element,
    options: Partial<ResizeTriggerClockOptions> = {},
  ) {
    super();
    const rect = this.target.getBoundingClientRect();
    this._snapshot = {
      trigger: 0,
      width: rect.width,
      height: rect.height,
    };
    this.signal = options.signal || getDefaultResizeSignal();
    this.signal.subscribe(this.target, this.onResize);
  }
  public snapshot(): void {
    if (this.state.trigger === 0) {
      this._snapshot.trigger = 0;
      return;
    }
    this._snapshot = this.state;
    this.state = { trigger: 0 };
  }
  public get trigger() {
    return this._snapshot.trigger;
  }
  public size(): Readonly<[number, number]> {
    return [this._snapshot.width, this._snapshot.height];
  }
  public destroy(): void {
    this.signal.unsubscribe(this.target);
  }
  private onResize = (e: Element) => {
    const rect = e.getBoundingClientRect();
    this.state = {
      trigger: 1,
      width: rect.width,
      height: rect.height,
    };
    this._heartbeat();
  };
}

// 画面上のマウスポインタの位置をクロックを監視するClock
// Clockとして利用しない場合、終了時にdestroy()でイベントリスナを解除する必要がある。
export class MousePositionClock
  extends BaseClock
  implements ClockPort, PositionReadablePort, VectorReadablePort, DisposablePort
{
  private mousePosition: [number, number] = [0, 0];
  private clientPosition: [number, number] = [0, 0];
  private _snapshot: Readonly<[number, number]> = [0, 0];
  private onMouseMove = (e: MouseEvent) => {
    const { clientX, clientY } = e;
    const { scrollX, scrollY } = window;
    this.clientPosition = [clientX, clientY];
    this.mousePosition = [this.clientPosition[0] + scrollX, this.clientPosition[1] + scrollY];
    this._heartbeat();
  };
  private onScroll = () => {
    const { scrollX, scrollY } = window;
    this.mousePosition = [this.clientPosition[0] + scrollX, this.clientPosition[1] + scrollY];
    this._heartbeat();
  };
  constructor(
    private subscriptionElement: Pick<
      HTMLElement,
      "addEventListener" | "removeEventListener"
    > = window,
  ) {
    super();
    this.subscriptionElement.addEventListener("mousemove", this.onMouseMove, {
      passive: true,
    });
    this.subscriptionElement.addEventListener("scroll", this.onScroll, {
      passive: true,
    });
  }
  public destroy() {
    this.subscriptionElement.removeEventListener("mousemove", this.onMouseMove);
    this.subscriptionElement.removeEventListener("scroll", this.onScroll);
  }
  public snapshot() {
    this._snapshot = [...this.mousePosition];
  }
  public position() {
    return this._snapshot;
  }
  public vector() {
    return this.position();
  }
}

// ポインターがDownしている間はGate=1になるClock
export class PrimaryPointerDownGateClock
  extends BaseClock
  implements ClockPort, GateReadablePort, PositionReadablePort
{
  private _snapshot: {
    gate: 0 | 1;
    position: [number, number];
  } = {
    gate: 0,
    position: [0, 0],
  };
  private state: {
    gate: 0 | 1;
    position: [number, number];
  } = {
    gate: 0,
    position: [0, 0],
  };
  private onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    this.state = {
      gate: 1,
      position: [e.clientX + window.scrollX, e.clientY + window.scrollY],
    };
    const el = this.subscriptionElement as unknown as {
      setPointerCapture?: (pointerId: number) => void;
    };
    el.setPointerCapture?.(e.pointerId);
    this._heartbeat();
  };
  private onPointerUp = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    this.state = {
      gate: 0,
      position: [e.clientX + window.scrollX, e.clientY + window.scrollY],
    };
    this._heartbeat();
  };
  constructor(
    private subscriptionElement: Pick<
      HTMLElement,
      "addEventListener" | "removeEventListener"
    > = window,
  ) {
    super();
    this.subscriptionElement.addEventListener("pointerdown", this.onPointerDown, {
      passive: true,
    });
    this.subscriptionElement.addEventListener("pointercancel", this.onPointerUp, {
      passive: true,
    });
    this.subscriptionElement.addEventListener("pointerup", this.onPointerUp, {
      passive: true,
    });
  }
  public destroy() {
    this.subscriptionElement.removeEventListener("pointerdown", this.onPointerDown);
    this.subscriptionElement.removeEventListener("pointercancel", this.onPointerUp);
    this.subscriptionElement.removeEventListener("pointerup", this.onPointerUp);
  }
  public snapshot() {
    this._snapshot.gate = this.state.gate;
    this._snapshot.position = [...this.state.position];
  }
  public get gate() {
    return this._snapshot.gate;
  }
  public position() {
    return this._snapshot.position;
  }
}

type PrimaryPointerPositionClockOption = {
  // gate=1のときにpositionを更新するためのGate。指定しない場合、常にpositionを更新する。
  gate: GateReadablePort;
  // gate切替時のposition位置。positionはpointermoveイベントで更新されるため、gateが1のときにpositionを更新したいがpointermoveイベントが発生しない場合に利用する。指定しない場合、gate切替時のpositionは更新されない。
  initPosition: PositionReadablePort;
};

export class PrimaryPointerPositionClock
  extends BaseClock
  implements ClockPort, VectorReadablePort, PositionReadablePort, DisposablePort
{
  private _snapshot: Readonly<[number, number]> = [0, 0];
  private state: {
    listening: boolean;
    position: [number, number];
  } = {
    listening: true,
    position: [0, 0],
  };
  private listening: () => boolean = () => true;
  private initPosition?: PositionReadablePort;
  private _dependencies: SnapshotPort[] = [];
  private onPointerMove = (e: PointerEvent) => {
    const { clientX, clientY } = e;
    this.state.position = [clientX, clientY];
    this._heartbeat();
  };
  constructor(
    private subscriptionElement: Pick<
      HTMLElement,
      "addEventListener" | "removeEventListener"
    > = window,
    options: Partial<PrimaryPointerPositionClockOption> = {},
  ) {
    super();
    if (options.initPosition) {
      this.initPosition = options.initPosition;
      this.state.position = [...this.initPosition.position()];
      this._dependencies.push(options.initPosition);
    }
    if (options.gate) {
      this.listening = () => options.gate?.gate === 1;
      this.state.listening = this.listening();
      this._dependencies.push(options.gate);
    }
    if (this.state.listening) {
      this.startListening();
    }
  }
  public destroy() {
    this.stopListening();
  }
  public snapshot() {
    if (this.state.listening && !this.listening()) {
      this.state.listening = false;
      this.stopListening();
      return;
    }
    if (!this.state.listening && this.listening()) {
      this.state.listening = true;
      this.startListening();
      // 今回は位置が取れない
      if (this.initPosition) {
        this.state.position = [...this.initPosition.position()];
      }
      return;
    }
    if (!this.state.listening) {
      return;
    }
    this._snapshot = [
      this.state.position[0] + window.scrollX,
      this.state.position[1] + window.scrollY,
    ];
  }
  public position() {
    return this._snapshot;
  }
  public vector() {
    return this._snapshot;
  }
  public dependencies() {
    return this._dependencies;
  }
  private startListening() {
    this.subscriptionElement.addEventListener("pointermove", this.onPointerMove, {
      passive: true,
    });
  }
  private stopListening() {
    this.subscriptionElement.removeEventListener("pointermove", this.onPointerMove);
  }
}

let viewportSignal: ViewportSignal | null = null;
let resizeSignal: ElementResizeSignal | null = null;

export function getDefaultViewportSignal() {
  if (!viewportSignal) {
    viewportSignal = new ViewportSignal();
  }
  return viewportSignal;
}

export function subscribeDefaultViewport(...arg: Parameters<ViewportSignal["subscribe"]>) {
  getDefaultViewportSignal().subscribe(...arg);
}

export function getDefaultResizeSignal() {
  if (!resizeSignal) {
    resizeSignal = new ElementResizeSignal();
  }
  return resizeSignal;
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

class WindowResizeSignal {
  private handlers = new Set<(w: WindowProxy) => void>();
  public subscribe(callback: (w: WindowProxy) => void) {
    if (this.handlers.size === 0) {
      window.addEventListener("resize", this.onResize, { passive: true });
    }
    this.handlers.add(callback);
  }
  public unsubscribe(callback: (w: WindowProxy) => void) {
    this.handlers.delete(callback);
    if (this.handlers.size === 0) {
      window.removeEventListener("resize", this.onResize);
    }
  }
  private onResize = (ev: UIEvent) => {
    for (const handler of this.handlers) {
      handler(ev.view as WindowProxy);
    }
  };
}

export const windowResizeSignal = new WindowResizeSignal();

export class ElementResizeSignal {
  private observer: ResizeObserver | null = null;
  private handlers = new Map<Element, (e: Element) => void>();

  public subscribe(target: Element, callback: (e: Element) => void) {
    this.handlers.set(target as Element, callback);
    this.ensureObserver().observe(target as Element);
  }
  public unsubscribe(target: Element) {
    this.handlers.delete(target as Element);
    if (this.observer) {
      this.observer.unobserve(target as Element);
    }
    if (this.handlers.size === 0 && this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
  private ensureObserver(): ResizeObserver {
    if (this.observer) {
      return this.observer;
    }
    this.observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target;
        this.handlers.get(target)?.(target);
      }
    });
    return this.observer;
  }
}
