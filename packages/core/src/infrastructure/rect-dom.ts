import type {
  GateReadablePort,
  PositionReadablePort,
  SizeReadablePort,
  SnapshotPort,
  TriggerReadablePort,
  VectorReadablePort,
} from "../domain";

type ElementLayoutRectOption = {
  // 座標更新のトリガー。Trigger(=1)したときに位置を更新します。
  trigger?: TriggerReadablePort;
};

/**
 * Element の座標を持つ。デフォルトで初期座標は固定されます。座標は scale/rotate を含むあらゆる CSS transform の影響を受けないレイアウト座標（offsetParent チェーン基準のドキュメント座標）で返されます。
 * サイズも offsetWidth/offsetHeight を使用するため transform に非依存です。
 * 初期化時のサイズを固定で利用します。動的なサイズ変更を期待する場合は ElementResizeTriggerClock を利用してください。
 */
export class ElementLayoutRect
  implements VectorReadablePort, PositionReadablePort, SizeReadablePort
{
  private readonly _size: [number, number]; // 固定値
  private _snapshot: [number, number] = [0, 0]; // 座標
  private readonly trigger: TriggerReadablePort | null = null; // 座標更新トリガー
  private readonly _dependencies: SnapshotPort[] = [];
  constructor(
    private readonly element: HTMLElement,
    options: ElementLayoutRectOption = {},
  ) {
    this._size = [this.element.offsetWidth, this.element.offsetHeight];
    this.update();
    if (options.trigger) {
      this.trigger = options.trigger;
      this._dependencies.push(options.trigger);
    }
  }
  public snapshot() {
    if (this.trigger?.trigger === 1) {
      this.update();
    }
  }
  public position(): Readonly<[number, number]> {
    return this._snapshot;
  }
  public size(): Readonly<[number, number]> {
    return this._size;
  }
  public vector(): Readonly<number[]> {
    return this.position();
  }
  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }

  /**座標に更新があれば_snapshotを更新します */
  private update() {
    const [nextX, nextY] = readDocumentLayoutPosition(this.element);
    if (this._snapshot[0] !== nextX || this._snapshot[1] !== nextY) {
      this._snapshot[0] = nextX;
      this._snapshot[1] = nextY;
    }
  }
}

/**Gateに従ってelementの親要素を切り替えます。座標は scale/rotate を含むあらゆる CSS transform の影響を受けないレイアウト座標（offsetParent チェーン基準のドキュメント座標）で返されます。
 * Gateが切り替わったらelementの座標を更新します。
 * サイズは offsetWidth/offsetHeight を使用するため transform に非依存です。
 * 初期化時のサイズを固定で利用します。動的なサイズ変更を期待する場合は ElementResizeTriggerClock を利用してください。
 */
export class ParentSwitchedLayoutRect
  implements VectorReadablePort, PositionReadablePort, SizeReadablePort
{
  private _snapshot: [number, number] = [0, 0]; // 座標
  private readonly _size: [number, number]; // 固定値
  private state: 0 | 1; // 0: falseParentの子, 1: trueParentの子
  private readonly _dependencies: SnapshotPort[];
  constructor(
    private readonly element: HTMLElement,
    private readonly gate: GateReadablePort,
    private readonly trueParent: Pick<Node, "appendChild">,
    private readonly falseParent: Pick<Node, "appendChild">,
  ) {
    const currentParent = element.parentNode;
    if (currentParent === trueParent) {
      this.state = 1;
    } else if (currentParent === falseParent) {
      this.state = 0;
    } else {
      throw new Error("Element must be a child of either trueParent or falseParent");
    }
    this._dependencies = [gate];
    this._snapshot = readDocumentLayoutPosition(element);
    this._size = [element.offsetWidth, element.offsetHeight];
    this.snapshot();
  }
  public snapshot(): void {
    const current = this.state;
    const next = this.gate.gate;
    if (current === next) return;
    this.state = next;
    // 要素を切り替えてから座標を取得します。
    this._switch();
    this._snapshot = readDocumentLayoutPosition(this.element);
  }

  public position(): Readonly<[number, number]> {
    return this._snapshot;
  }
  public size(): Readonly<[number, number]> {
    return this._size;
  }
  public vector(): Readonly<number[]> {
    return this._snapshot;
  }
  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }
  // stateの状態に従って要素を切り替えます。
  private _switch(): void {
    if (this.state === 1) {
      this.trueParent.appendChild(this.element);
    } else {
      this.falseParent.appendChild(this.element);
    }
  }
}

// DOMのレイアウト上のドキュメント座標を返します。
// offsetParent チェーンを積み上げるため、translate/scale/rotate などあらゆる
// CSS transform の影響を受けません。
function readDocumentLayoutPosition(element: HTMLElement): [number, number] {
  let x = 0;
  let y = 0;
  let el: HTMLElement | null = element;
  while (el !== null) {
    x += el.offsetLeft;
    y += el.offsetTop;
    el = el.offsetParent as HTMLElement | null;
  }
  return [x, y];
}
