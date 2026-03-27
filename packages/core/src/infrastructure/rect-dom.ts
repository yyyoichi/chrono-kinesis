import type {
  GateReadablePort,
  PositionReadablePort,
  SizeReadablePort,
  SnapshotPort,
  TriggerReadablePort,
  VectorReadablePort,
} from "../domain";

/**
 * 要素の座標・サイズの取得空間を定義します。
 * - `padding-box`: transform に非依存。padding-box 左上 / clientWidth, clientHeight。
 * - `border-box`: transform に非依存。border-box 左上 / offsetWidth, offsetHeight。
 * - `visual`: transform 適用後。見た目の矩形(getBoundingClientRect)基準。
 */
export type ElementRectSpace = "padding-box" | "border-box" | "visual";

type ElementRectOption = {
  // 座標更新のトリガー。trigger が 1 のときに座標を更新します。
  trigger?: TriggerReadablePort;
  // 座標・サイズをどの取得空間で扱うかを指定します。
  space?: ElementRectSpace;
};

type ElementTupleReader = (element: HTMLElement) => [number, number];

/**
 * Element の座標を持つ。
 * 初期化時に座標を取得して固定します。座標はオプションの trigger を利用して更新できます。
 * 初期化時のサイズを固定で利用します。動的なサイズ変更を期待する場合は ElementResizeTriggerClock を利用してください。
 */
export class ElementRect implements VectorReadablePort, PositionReadablePort, SizeReadablePort {
  private readonly _size: [number, number]; // 固定値
  private _snapshot: [number, number] = [0, 0]; // 座標
  private readonly readPosition: ElementTupleReader;
  private readonly trigger: TriggerReadablePort | null = null; // 座標更新トリガー
  private readonly _dependencies: SnapshotPort[] = [];
  constructor(
    private readonly element: HTMLElement,
    options: ElementRectOption = {},
  ) {
    const space = options.space ?? "padding-box";
    this.readPosition = getPositionReader(space);
    this._size = readElementSize(this.element, space);
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
    const [nextX, nextY] = this.readPosition(this.element);
    if (this._snapshot[0] !== nextX || this._snapshot[1] !== nextY) {
      this._snapshot[0] = nextX;
      this._snapshot[1] = nextY;
    }
  }
}

type ParentSwitchedRectOption = {
  // 座標・サイズをどの取得空間で扱うかを指定します。
  space?: ElementRectSpace;
};

/**Gateに従ってelementの親要素を切り替えます。
 * Gateが切り替わったらelementの座標を更新します。
 * 初期化時のサイズを固定で利用します。動的なサイズ変更を期待する場合は ElementResizeTriggerClock を利用してください。
 */
export class ParentSwitchedRect
  implements VectorReadablePort, PositionReadablePort, SizeReadablePort
{
  private _snapshot: [number, number] = [0, 0]; // 座標
  private readonly _size: [number, number]; // 固定値
  private state: 0 | 1; // 0: falseParentの子, 1: trueParentの子
  private readonly readPosition: ElementTupleReader;
  private readonly _dependencies: SnapshotPort[];
  constructor(
    private readonly element: HTMLElement,
    private readonly gate: GateReadablePort,
    private readonly trueParent: Pick<Node, "appendChild">,
    private readonly falseParent: Pick<Node, "appendChild">,
    options: ParentSwitchedRectOption = {},
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
    this.readPosition = getPositionReader(options.space ?? "padding-box");
    this._snapshot = this.readPosition(element);
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
    this._snapshot = this.readPosition(this.element);
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

/**
 * element 自身を除いた offsetParent チェーンのドキュメント座標を返します。
 * 中間スクロールコンテナのスクロール量は減算し、ルートスクロールは除外します。
 */
function readOffsetParentPosition(element: HTMLElement): [number, number] {
  let x = 0;
  let y = 0;
  let el: HTMLElement | null = element.offsetParent as HTMLElement | null;
  while (el !== null) {
    x += el.offsetLeft + el.clientLeft;
    y += el.offsetTop + el.clientTop;
    el = el.offsetParent as HTMLElement | null;
  }

  // スクロールの影響を打ち消すため、親要素のスクロール量を減算します。
  const scrollingElement = document.scrollingElement;
  let ancestor: HTMLElement | null = element.parentElement;
  while (ancestor !== null) {
    const isRootScrollContainer =
      ancestor === document.documentElement ||
      ancestor === document.body ||
      (scrollingElement !== null && ancestor === scrollingElement);
    if (!isRootScrollContainer) {
      x -= ancestor.scrollLeft;
      y -= ancestor.scrollTop;
    }
    ancestor = ancestor.parentElement;
  }

  return [x, y];
}

/**
 * 要素の border-box 左上のドキュメント座標を返します。
 */
function readBorderBoxPosition(element: HTMLElement): [number, number] {
  const [parentX, parentY] = readOffsetParentPosition(element);
  return [parentX + element.offsetLeft, parentY + element.offsetTop];
}

/**
 * 要素の padding-box 左上のドキュメント座標を返します。
 */
function readPaddingBoxPosition(element: HTMLElement): [number, number] {
  const [parentX, parentY] = readOffsetParentPosition(element);
  return [
    parentX + element.offsetLeft + element.clientLeft,
    parentY + element.offsetTop + element.clientTop,
  ];
}

/**
 * transform 適用後の見た目上の左上座標をドキュメント座標で返します。
 */
function readVisualPosition(element: HTMLElement): [number, number] {
  const rect = element.getBoundingClientRect();
  return [rect.left + window.scrollX, rect.top + window.scrollY];
}

/**
 * 取得空間に対応する座標リーダーを返します。
 */
function getPositionReader(space: ElementRectSpace): ElementTupleReader {
  if (space === "padding-box") return readPaddingBoxPosition;
  if (space === "visual") return readVisualPosition;
  return readBorderBoxPosition;
}

/**
 * 取得空間に対応するサイズを返します。
 */
function readElementSize(element: HTMLElement, space: ElementRectSpace): [number, number] {
  if (space === "padding-box") {
    return [element.clientWidth, element.clientHeight];
  }
  if (space === "visual") {
    const rect = element.getBoundingClientRect();
    return [rect.width, rect.height];
  }
  return [element.offsetWidth, element.offsetHeight];
}
