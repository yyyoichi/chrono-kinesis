import type {
  GateReadablePort,
  PositionReadablePort,
  SizeReadablePort,
  SnapshotPort,
  TriggerReadablePort,
  VectorReadablePort,
} from "../ports";
import { type ElementRectSpace, getPositionReader, readElementSize } from "./contracts/dom-space";

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
    this._size = readElementSize(space, this.element);
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

type ParentSwitchTriggerOption = {
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
 * const rect = new ElementRect(node, { trigger });
 * simulation.add({
 *   clock: someClock,
 *   target: someTarget,
 *   // TeleportKineticsを用いて座標切替をKineticsに通知して初期化座標を修正することを検討してください。
 *   kinetics: new TeleportKinetics(rect),
 *   physics: somePhysics,
 * });
 */
export class ParentSwitchTrigger implements TriggerReadablePort {
  private _snapshot: 0 | 1 = 0; // 1のときに切り替えが発生することを表すフラグ
  private state: {
    currentParent: 0 | 1; // 0: falseParentの子, 1: trueParentの子
    trigger: boolean; // 切替が発生したか。
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
    options: ParentSwitchTriggerOption = {},
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
    const current = this.gate.gate;
    const requiredSwitch = prev !== current;
    // Switchを許可するかどうか。switchGateが未指定の場合は常に許可します。
    const enabledSwitch = this.switchGate === null || this.switchGate.gate === 1;
    // Switchが必要で、かつ許可されている場合は切替を予約します。
    if (requiredSwitch && enabledSwitch) {
      // snapshotでの副作用ではなく座標更新と解釈します。
      // 同一snapshotでtriggerによるElementRectの更新、Kineticsのteleportまで期待します。
      this._switch(current);
      this.state.currentParent = current;
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
  // parentに従っての親要素を切り替えます。
  private _switch(parent: 0 | 1) {
    if (parent === 1) {
      this.trueParent.appendChild(this.node);
    } else {
      this.falseParent.appendChild(this.node);
    }
  }
}
