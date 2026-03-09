import {
  BaseClock,
  type ClockPort,
  type DisposablePort,
  type GateReadablePort,
  type PositionReadablePort,
  type VectorReadablePort,
} from "../domain";

// 要素上部が[on|off]%を通過したらON=1,OFF=0をdeltaにする
type ViewportThresholdOptions = {
  on: number;
  off: number;
  isAbsoluteTarget: boolean;
  viewportSignal: ViewportSignal;
};

// DomがViewportの特定の位置を超えたらON/OFFを切り替え、deltaとして1/0の値を出すClock
export class ViewportThresholdGateClock
  extends BaseClock
  implements ClockPort, GateReadablePort
{
  // 監視対象のトリガー位置設定
  private offsetRatioConfig: Record<"on" | "off", number> = {
    on: 0.1,
    off: 0,
  };
  private signal: ViewportSignal;
  private state: "on" | "off";
  private _snapshot: 0 | 1 = 0; // 0 or 1
  // ターゲットとなる要素のtopからの距離
  private offsets: Record<"on" | "off", number> = {
    on: 0,
    off: 0,
  };
  private target: HTMLElement;

  constructor(
    target: HTMLElement,
    options: Partial<ViewportThresholdOptions> = {},
  ) {
    super();
    if (options.on) {
      this.offsetRatioConfig.on = Math.max(0, Math.min(1, options.on));
    }
    if (options.off) {
      this.offsetRatioConfig.off = Math.max(0, Math.min(1, options.off));
    }
    this.signal = options.viewportSignal || getDefaultViewportSignal();

    if (!options.isAbsoluteTarget) {
      // 対象となる要素の最初の子要素にrelative>abusoluteでトリガーを配置。
      // top=0とすれば要素の上端と一致、resizeやtargetそのものの移動があっても
      // translateYで位置を調整可能。
      const child = document.createElement("div");
      child.style.position = "relative";
      child.style.pointerEvents = "none";
      // target > child(relative) > this.target(absolute)
      this.target = ViewportThresholdGateClock.createTarget();
      child.appendChild(this.target);
      // targetの直下のfirstに配置
      target.insertAdjacentElement("afterbegin", child);
    } else {
      this.target = target;
    }

    const vh = Math.max(window.innerHeight, 1);
    this.updateThresholdOffsets(vh);
    // 初期位置から初期ステート決定
    const { top } = target.getBoundingClientRect();
    // viewport下端からの距離
    const point = vh - top;
    this.state = point > this.offsets.on ? "on" : "off";
    this.snapshot();
    this.signal.subscribe(this.target, this.toggleStateAndHeatbeat.bind(this));
  }
  // 同じ要素に対してクロックを作成する。
  public newClock(
    options: Pick<Partial<ViewportThresholdOptions>, "on" | "off"> = {},
  ) {
    const target = ViewportThresholdGateClock.createTarget();
    // user target > child(relative) > the target(absolute)
    this.target.parentElement?.appendChild(target);
    return new ViewportThresholdGateClock(target, {
      isAbsoluteTarget: true,
      on: options.on || this.offsetRatioConfig.on,
      off: options.off || this.offsetRatioConfig.off,
      viewportSignal: this.signal,
    });
  }
  public destroy() {
    this.signal.subscribe(this.target, this.toggleStateAndHeatbeat.bind(this));
  }
  public snapshot(): void {
    this._snapshot = this.state === "on" ? 1 : 0;
  }
  public get gate() {
    return this._snapshot;
  }

  // ステートを切り替えてイベントする。
  public toggleStateAndHeatbeat() {
    this.state = this.state === "on" ? "off" : "on";
    this.applySentinelOffset();
    this._heartbeat();
  }
  // on/offの位置を更新して移動させる。
  private updateThresholdOffsets(vh = Math.max(window.innerHeight, 1)) {
    // viewport下端からの距離を計算
    const on = this.offsetRatioConfig.on * vh;
    const off = this.offsetRatioConfig.off * vh;
    this.offsets.on = Math.round(on * 10) / 10;
    this.offsets.off = Math.round(off * 10) / 10;
    this.applySentinelOffset();
  }
  // 現在のstateに応じてtargetを移動させる
  private applySentinelOffset() {
    // translate等で監視要素の位置を物理的にズラす
    this.target.style.transform = `translateY(${this.offsets[this.state]}px)`;
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
    this.mousePosition = [
      this.clientPosition[0] + scrollX,
      this.clientPosition[1] + scrollY,
    ];
    this._heartbeat();
  };
  private onScroll = () => {
    const { scrollX, scrollY } = window;
    this.mousePosition = [
      this.clientPosition[0] + scrollX,
      this.clientPosition[1] + scrollY,
    ];
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

let viewportSignal: ViewportSignal | null = null;

export function getDefaultViewportSignal() {
  if (!viewportSignal) {
    viewportSignal = new ViewportSignal();
  }
  return viewportSignal;
}

export function subscribeDefaultViewport(
  ...arg: Parameters<ViewportSignal["subscribe"]>
) {
  getDefaultViewportSignal().subscribe(...arg);
}

export class ViewportSignal {
  private observer: IntersectionObserver | null = null;
  private handlers = new Map<Element, () => void>();
  public subscribe(target: Element, callback: () => void) {
    this.handlers.set(target, callback);
    this.ensureObserver().observe(target);
  }
  public unsubscribe(target: Element) {
    this.handlers.delete(target);
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
          this.handlers.get(target)?.();
        }
      },
      // 画面下部と交差で発火
      {
        root: null,
        rootMargin: "0px",
        threshold: 0,
      },
    );
    return this.observer;
  }
}
