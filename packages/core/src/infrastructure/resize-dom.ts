import {
  BaseClock,
  type ClockPort,
  type DisposablePort,
  type SizeReadablePort,
  type TriggerReadablePort,
} from "../domain";
import { type ElementRectSpace, readElementSize } from "./contracts/dom-space";

export class WindowResizeTriggerClock
  extends BaseClock
  implements ClockPort, TriggerReadablePort, SizeReadablePort, DisposablePort
{
  private _snapshot: {
    trigger: 0 | 1;
    size: [number, number];
  } = {
    trigger: 0,
    size: [window.innerWidth, window.innerHeight],
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
  private readonly signal: WindowResizeSignal;
  constructor() {
    super();
    this.signal = getWindowResizeSignal();
    this.signal.subscribe(this.onResize);
  }
  public snapshot(): void {
    if (this.state.trigger === 0) {
      this._snapshot.trigger = 0;
      return;
    }
    this._snapshot = {
      trigger: 1,
      size: [this.state.width, this.state.height],
    };
    this.state = { trigger: 0 };
  }
  public get trigger() {
    return this._snapshot.trigger;
  }
  public size(): Readonly<[number, number]> {
    return this._snapshot.size;
  }
  public destroy(): void {
    this.signal.unsubscribe(this.onResize);
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

type ElementResizeTriggerClockOption = {
  space?: ElementRectSpace;
};

// Domの特定の要素のリサイズを監視するClock
// 一つのDomに対して一つのElementResizeTriggerClockのみが有効です。
export class ElementResizeTriggerClock
  extends BaseClock
  implements ClockPort, TriggerReadablePort, SizeReadablePort, DisposablePort
{
  private _snapshot: {
    trigger: 0 | 1;
    size: [number, number];
  } = {
    trigger: 0,
    size: [0, 0],
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
  private readonly signal: ElementResizeSignal;
  private readonly readSize: (el: HTMLElement) => [number, number];
  constructor(
    private readonly target: HTMLElement,
    options: ElementResizeTriggerClockOption = {},
  ) {
    super();

    this.signal = getDefaultResizeSignal();
    this.signal.subscribe(this.target, this.onResize);
    const space = options.space ?? "padding-box";
    this.readSize = readElementSize.bind(null, space);
    this._snapshot = {
      trigger: 0,
      size: this.readSize(this.target),
    };
  }
  public snapshot(): void {
    if (this.state.trigger === 0) {
      this._snapshot.trigger = 0;
      return;
    }
    this._snapshot = {
      trigger: 1,
      size: [this.state.width, this.state.height],
    };
    this.state = { trigger: 0 };
  }
  public get trigger() {
    return this._snapshot.trigger;
  }
  public size(): Readonly<[number, number]> {
    return this._snapshot.size;
  }
  public destroy(): void {
    this.signal.unsubscribe(this.target);
  }
  private onResize = (e: Element) => {
    const [width, height] = this.readSize(e as HTMLElement);
    this.state = {
      trigger: 1,
      width: width,
      height: height,
    };
    this._heartbeat();
  };
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

let windowResizeSignal: WindowResizeSignal | null = null;

function getWindowResizeSignal() {
  if (!windowResizeSignal) {
    windowResizeSignal = new WindowResizeSignal();
  }
  return windowResizeSignal;
}

class ElementResizeSignal {
  private observer: ResizeObserver | null = null;
  private readonly handlers = new Map<Element, (e: Element) => void>();

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

let resizeSignal: ElementResizeSignal | null = null;

function getDefaultResizeSignal() {
  if (!resizeSignal) {
    resizeSignal = new ElementResizeSignal();
  }
  return resizeSignal;
}
