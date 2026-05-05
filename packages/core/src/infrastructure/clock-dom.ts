import {
  BaseClock,
  type ClockPort,
  type DisposablePort,
  type PositionReadablePort,
  type SizeReadablePort,
  type TriggerReadablePort,
  type VectorReadablePort,
} from "../domain";

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
    this._snapshot = {
      trigger: 1,
      width: this.state.width,
      height: this.state.height,
    };
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
  private onResize = (w: Window) => {
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

/**@deprecated use PointerClock */
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

let resizeSignal: ElementResizeSignal | null = null;

export function getDefaultResizeSignal() {
  if (!resizeSignal) {
    resizeSignal = new ElementResizeSignal();
  }
  return resizeSignal;
}

class WindowResizeSignal {
  private handlers = new Set<(w: Window) => void>();
  public subscribe(callback: (w: Window) => void) {
    if (this.handlers.size === 0) {
      window.addEventListener("resize", this.onResize, { passive: true });
    }
    this.handlers.add(callback);
  }
  public unsubscribe(callback: (w: Window) => void) {
    this.handlers.delete(callback);
    if (this.handlers.size === 0) {
      window.removeEventListener("resize", this.onResize);
    }
  }
  private onResize = (_ev: UIEvent) => {
    for (const handler of this.handlers) {
      handler(window);
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
