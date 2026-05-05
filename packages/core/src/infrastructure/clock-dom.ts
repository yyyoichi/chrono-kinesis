import {
  BaseClock,
  type ClockPort,
  type DisposablePort,
  type PositionReadablePort,
  type VectorReadablePort,
} from "../domain";

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
