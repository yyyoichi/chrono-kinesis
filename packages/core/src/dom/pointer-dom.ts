import { BaseClock } from "../chronos";
import type {
  ClockPort,
  DisposablePort,
  GateReadablePort,
  PositionReadablePort,
  SnapshotPort,
  VectorReadablePort,
} from "../ports";

type PrimaryPointerDownGateClockOption = {
  // pointerdown後、要素外でのpointerupイベントを拾うかどうか。デフォルトで拾います。
  useCapture?: boolean;
};

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
  private useCapture: boolean = true;
  private onPointerDown = (e: Event) => {
    if (!(e instanceof PointerEvent)) return;
    if (!e.isPrimary) return;
    if (this.state.gate === 1) return;
    this.state = {
      gate: 1,
      position: [e.clientX + window.scrollX, e.clientY + window.scrollY],
    };
    if (this.useCapture) {
      const el = this.subscriptionElement as unknown as {
        setPointerCapture?: (pointerId: number) => void;
      };
      el.setPointerCapture?.(e.pointerId);
    }
    this._heartbeat();
  };
  private onPointerUp = (e: Event) => {
    if (!(e instanceof PointerEvent)) return;
    if (!e.isPrimary) return;
    if (this.state.gate === 0) return;
    this.state = {
      gate: 0,
      position: [e.clientX + window.scrollX, e.clientY + window.scrollY],
    };
    if (this.useCapture) {
      const el = this.subscriptionElement as unknown as {
        releasePointerCapture?: (pointerId: number) => void;
        hasPointerCapture?: (pointerId: number) => boolean;
      };
      if (el.hasPointerCapture?.(e.pointerId)) {
        el.releasePointerCapture?.(e.pointerId);
      }
    }
    this._heartbeat();
  };
  private onLostPointerCapture = (e: Event) => {
    if (!(e instanceof PointerEvent)) return;
    if (!e.isPrimary) return;
    if (this.state.gate === 0) return;
    // iOSでは再captureできずクラッシュするため要調査
    if (e.pointerType === "touch") return;
    // 原則pointerupイベントでpointer captureをリリースする。
    // captureが解除されたら、明示的にupされていない限り再captureする。
    const el = this.subscriptionElement as unknown as {
      setPointerCapture?: (pointerId: number) => void;
      hasPointerCapture?: (pointerId: number) => boolean;
    };
    // touch系 / 要素が切り離されている場合は再captureできないのでgateを閉じる。
    const isConnected = el instanceof Element ? el.isConnected : true; // window等はtrue
    if (!isConnected) {
      this.state = { gate: 0, position: this.state.position };
      this._heartbeat();
      return;
    }
    // 再captureを試みる。pointerId失効などでDOMExceptionが発生した場合もgateを閉じる。
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      this.state = { gate: 0, position: this.state.position };
      this._heartbeat();
    }
  };
  constructor(
    private subscriptionElement: EventTarget = window,
    options: PrimaryPointerDownGateClockOption = {},
  ) {
    super();
    if (typeof options.useCapture === "boolean") {
      this.useCapture = options.useCapture;
    }
    this.subscriptionElement.addEventListener("pointerdown", this.onPointerDown, {
      passive: true,
    });
    this.subscriptionElement.addEventListener("pointercancel", this.onPointerUp, {
      passive: true,
    });
    this.subscriptionElement.addEventListener("pointerup", this.onPointerUp, {
      passive: true,
    });
    if (this.useCapture) {
      this.subscriptionElement.addEventListener("lostpointercapture", this.onLostPointerCapture, {
        passive: true,
      });
    }
  }
  public destroy() {
    this.subscriptionElement.removeEventListener("pointerdown", this.onPointerDown);
    this.subscriptionElement.removeEventListener("pointercancel", this.onPointerUp);
    this.subscriptionElement.removeEventListener("pointerup", this.onPointerUp);
    if (this.useCapture) {
      this.subscriptionElement.removeEventListener("lostpointercapture", this.onLostPointerCapture);
    }
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
  gate?: GateReadablePort;
  // gate切替時のposition位置。positionはpointermoveイベントで更新されるため、gateが1のときにpositionを更新したいがpointermoveイベントが発生しない場合に利用する。指定しない場合、gate切替時のpositionは更新されない。
  initPosition?: PositionReadablePort;
};

export class PrimaryPointerPositionClock
  extends BaseClock
  implements ClockPort, VectorReadablePort, PositionReadablePort, DisposablePort
{
  private _snapshot: Readonly<[number, number]> = [0, 0];
  private state: {
    // idle: 非監視、watching: 監視中、received: 監視中で座標を受け取った
    mode: "idle" | "watching" | "received";
    clientPosition: [number, number]; // クライアント座標(スクロール分はSnapshot枚に取得する)
  } = {
    mode: "idle",
    clientPosition: [0, 0],
  };
  private shouldListening: () => boolean = () => true;
  private initPosition?: PositionReadablePort;
  private _dependencies: SnapshotPort[] = [];
  private onPointerMove = (e: Event) => {
    if (!(e instanceof PointerEvent)) return;
    if (!e.isPrimary) return;
    const { clientX, clientY } = e;
    this.state.mode = "received";
    this.state.clientPosition = [clientX, clientY];
    this._heartbeat();
  };
  constructor(
    private subscriptionElement: EventTarget = window,
    options: PrimaryPointerPositionClockOption = {},
  ) {
    super();
    if (options.initPosition) {
      this.initPosition = options.initPosition;
      this._dependencies.push(options.initPosition);
    }
    if (options.gate) {
      this.shouldListening = () => options.gate?.gate === 1;
      this._dependencies.push(options.gate);
    }
    this.snapshot();
  }
  public destroy() {
    this.stopListening();
  }
  public snapshot() {
    const shouldListening = this.shouldListening();
    if (this.state.mode !== "idle" && !shouldListening) {
      this.state.mode = "idle";
      this.stopListening();
      return;
    }
    if (this.state.mode === "idle" && shouldListening) {
      this.state.mode = "watching";
      if (this.initPosition) {
        this._snapshot = [...this.initPosition.position()];
      }
      this.startListening();
      return;
    }
    if (this.state.mode === "received") {
      this._snapshot = [
        this.state.clientPosition[0] + window.scrollX,
        this.state.clientPosition[1] + window.scrollY,
      ];
    }
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
