import type {
  GateReadablePort,
  PhysicsPort,
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
    const position = this.readPosition(this.element);
    if (position[0] === this._snapshot[0] && position[1] === this._snapshot[1]) return;
    this._snapshot = position;
  }
}

type ParentSwitchedPhysicsOption = {
  // gate=1のときにのみ座標を更新するオプション。これを有効にすると、gateが0のときは要素は切り替えられません。
  switchGate?: GateReadablePort;
};
/**
 * 親要素を切り替える TriggerReadablePort です。
 * gateの状態に応じて、要素をtrueParentとfalseParentのどちらかに切り替えます。
 * @param node 通常はHTMLElementです。appendChild可能なDOMは[MDNのappendChildの例外](https://developer.mozilla.org/en-US/docs/Web/API/Node/appendChild#exceptions)に従います。
 * @param gate 切り替えの条件となるGateReadablePortです。gate=1のときtrueParentに、gate=0のときfalseParentにnodeを切り替えます。
 * @param trueParent nodeを配置する親要素。gate=1のときにnodeをこの要素の子にします。
 * @param falseParent nodeを配置する親要素。gate=0のときにnodeをこの要素の子にします。
 * @param options
 * @example
 * // 切替対象となる node を ElementRect に利用する場合、オプションに trigger として渡すことで移動後の座標をElementRect内で更新することが出来ます。
 * const trigger = new ParentSwitchTrigger(node, gate, trueParent, falseParent);
 * const rect = new ElementRect(node {trigger});
 * simulation.add({
 *   clock: someClock,
 *   target: somTarget,
 *   // TeleportKineticsを用いて座標切替をKineticsに通知して初期化座標を修正することを検討してください。
 *   kinetics: new TeleportKinetics(rect),
 *   physics: somePhysics,
 * });
 */
export class ParentSwitchTrigger implements TriggerReadablePort {
  private _snapshot: 0 | 1 = 0; // 1のときに切り替えが発生することを表すフラグ
  private state: {
    currentParent: 0 | 1; // 0: falseParentの子, 1: trueParentの子
    trigger: boolean; // 切替が発生するか。1のときapply時に切替が実行されます。
  } = {
    currentParent: 0,
    trigger: false,
  };
  private readonly switchGate: GateReadablePort | null = null; // 座標更新の条件となるゲート
  private readonly _dependencies: SnapshotPort[];
  constructor(
    private readonly node: Node,
    private readonly gate: GateReadablePort,
    private readonly trueParent: Node,
    private readonly falseParent: Node,
    options: ParentSwitchedPhysicsOption = {},
  ) {
    const currentParent = node.parentNode;
    if (currentParent === trueParent) {
      this.state.currentParent = 1;
    } else if (currentParent === falseParent) {
      this.state.currentParent = 0;
    } else {
      throw new Error("Element must be a child of either trueParent or falseParent");
    }
    this._dependencies = [gate];
    if (options.switchGate) {
      this.switchGate = options.switchGate;
      this._dependencies.push(options.switchGate);
    }
  }

  public snapshot(): void {
    this.state.trigger = false;

    const prev = this.state.currentParent;
    this.state.currentParent = this.gate.gate;
    const requiredSwitch = prev !== this.state.currentParent;
    // Switchを許可するかどうか。switchGateが未指定の場合は常に許可します。
    const enabledSwitch = this.switchGate === null || this.switchGate.gate === 1;
    // Switchが必要で、かつ許可されている場合は切替を予約します。
    if (requiredSwitch && enabledSwitch) {
      // snapshotでの副作用ではなく座標更新と解釈します。
      // 同一snapshotでtriggerによるElementRectの更新、Kineticsのteleportまで期待します。
      this._switch();
      this.state.trigger = true;
    }

    this._snapshot = this.state.trigger ? 1 : 0;
  }
  public get trigger(): Readonly<0 | 1> {
    return this._snapshot;
  }
  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }
  // stateに従って親要素を切り替えます。
  private _switch() {
    if (this.state.currentParent === 1) {
      this.trueParent.appendChild(this.node);
    } else {
      this.falseParent.appendChild(this.node);
    }
  }
}

type ParentSwitchedRectOption = {
  // 座標更新のトリガー。trigger が 1 のときに座標を更新します。
  trigger?: TriggerReadablePort;
  // 座標・サイズをどの取得空間で扱うかを指定します。
  space?: ElementRectSpace;
  // gate=1のときにのみ座標を更新するオプション。これを有効にすると、gateが0のときは要素は切り替えられません。
  switchGate?: GateReadablePort;
};

/**
 * @deprecated Position, Sizeの役割がElementRectと重複して責務不明瞭のため非推奨。ParentSwitchTriggerとElementRectを組み合わせて利用してください。
 * Gateに従ってelementの親要素を切り替えます。
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
  private readonly trigger: TriggerReadablePort | null = null; // 座標更新トリガー
  private readonly switchGate: GateReadablePort | null = null; // 座標更新の条件となるゲート
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
    this._size = readElementSize(element, options.space ?? "padding-box");

    if (options.trigger) {
      this.trigger = options.trigger;
      this._dependencies.push(options.trigger);
    }
    if (options.switchGate) {
      this.switchGate = options.switchGate;
      this._dependencies.push(options.switchGate);
    }
    this.snapshot();
  }
  public snapshot(): void {
    const current = this.state;
    const next = this.gate.gate;
    const requiredSwitch = current !== next;
    // Switchを許可するかどうか。switchGateが未指定の場合は常に許可します。
    const enabledSwitch = this.switchGate === null || this.switchGate.gate === 1;
    const triggered = this.trigger?.trigger === 1;

    // Switchが必要で、かつ許可されている場合は親要素を切り替えて座標を更新します。
    if (requiredSwitch && enabledSwitch) {
      // 親要素を切り替えて座標更新
      this.state = next;
      // 要素を切り替えてから座標を取得します。
      this._switch();
      this._snapshot = this.readPosition(this.element);
      return;
    }

    // triggerが発火している場合は座標更新のみ行います。
    if (triggered) {
      const position = this.readPosition(this.element);
      if (this._snapshot[0] === position[0] && this._snapshot[1] === position[1]) return;
      this._snapshot = position;
      return;
    }
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
