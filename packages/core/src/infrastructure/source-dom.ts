import type {
  GateReadablePort,
  PositionReadablePort,
  SizeReadablePort,
  SnapshotPort,
  TriggerReadablePort,
  VectorReadablePort,
} from "../domain/ports";
import type { DomPhysicsSource } from "./contracts/dom-physics-source";

type ElementPositionOption = {
  // 座標更新のトリガー。Trigger(=1)したときに位置を更新します。
  trigger?: TriggerReadablePort;
};

/**
 * Element の座標を持つ。デフォルトで初期座標は固定されます。
 * 初期化時の要素をSizeReadablePortとして利用します。動的なサイズ変更を期待する場合は ElementResizeTriggerClock を利用してください。
 */
export class ElementPosition implements VectorReadablePort, PositionReadablePort, SizeReadablePort {
  private readonly _size: [number, number]; // 固定値
  private _snapshot: [number, number] = [0, 0]; // 座標
  private readonly trigger: TriggerReadablePort | null = null; // 座標更新トリガー
  private readonly _dependencies: SnapshotPort[] = [];
  constructor(
    private readonly element: HTMLElement,
    options: ElementPositionOption = {},
  ) {
    const rect = this.element.getBoundingClientRect();
    this._size = [rect.width, rect.height];
    this.update(rect);
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
  private update(rect: DOMRect = this.element.getBoundingClientRect()) {
    const nextX = rect.left + window.scrollX;
    const nextY = rect.top + window.scrollY;
    if (this._snapshot[0] !== nextX || this._snapshot[1] !== nextY) {
      this._snapshot[0] = nextX;
      this._snapshot[1] = nextY;
    }
  }
}

/**Gateに従ってelementの親要素を切り替えます。
 * Gateが切り替わったらelementの座標を更新します。
 * サイズは初期化時のサイズを固定で利用します。動的なサイズ変更を期待する場合は ElementResizeTriggerClock を利用してください。
 */
export class GateParentSwitchPosition
  implements VectorReadablePort, PositionReadablePort, SizeReadablePort
{
  private _snapshot: [number, number] = [0, 0]; // 座標
  private readonly _size: [number, number];
  private state: 0 | 1; // 0: falseParentの子, 1: trueParentの子
  private readonly _dependencies: SnapshotPort[];
  constructor(
    private readonly element: HTMLElement,
    private readonly gate: GateReadablePort,
    private readonly trueParent: Pick<Node, "appendChild">,
    private readonly falseParent: Pick<Node, "appendChild">,
  ) {
    const currentParent = element.parentElement;
    if (currentParent === trueParent) {
      this.state = 1;
    } else if (currentParent === falseParent) {
      this.state = 0;
    } else {
      throw new Error("Element must be a child of either trueParent or falseParent");
    }
    this._dependencies = [gate];
    const rect = this.element.getBoundingClientRect();
    this._snapshot = readDocumentLayoutPosition(element, rect);
    this._size = [rect.width, rect.height];
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

// Domの配置されるドキュメント座標を返します。
function readDocumentLayoutPosition(
  element: HTMLElement,
  rect: DOMRect = element.getBoundingClientRect(),
): [number, number] {
  let x = rect.left + window.scrollX;
  let y = rect.top + window.scrollY;

  const transform = getComputedStyle(element).transform;
  if (!transform || transform === "none") {
    return [x, y];
  }

  // translate3d/translate/DOMMatrixの平行移動成分のみ打ち消します。
  const matrix = new DOMMatrixReadOnly(transform);
  x -= matrix.m41;
  y -= matrix.m42;
  return [x, y];
}

/**@deprecated APIリクエストが多重のため。より高効率な ElementSource を利用する。 */
export class DomSource
  implements VectorReadablePort, PositionReadablePort, SizeReadablePort, DomPhysicsSource
{
  private _snapshot: {
    absolute: [number, number];
    size: [number, number];
  } = {
    absolute: [0, 0],
    size: [0, 0],
  };
  constructor(private readonly element: HTMLElement) {
    this.snapshot();
  }
  public snapshot() {
    const rect = this.element.getBoundingClientRect();
    const nextX = rect.left + window.scrollX;
    const nextY = rect.top + window.scrollY;
    const [currentX, currentY] = this._snapshot.absolute;
    if (currentX !== nextX || currentY !== nextY) {
      this._snapshot.absolute = [nextX, nextY];
    }

    const nextW = rect.width;
    const nextH = rect.height;
    const [currentW, currentH] = this._snapshot.size;
    if (currentW !== nextW || currentH !== nextH) {
      this._snapshot.size = [nextW, nextH];
    }
    return;
  }
  public position(): Readonly<[number, number]> {
    return this._snapshot.absolute;
  }
  public vector(): Readonly<number[]> {
    return this.position();
  }
  public size(): Readonly<[number, number]> {
    return this._snapshot.size;
  }

  public apply(style: Partial<CSSStyleDeclaration>) {
    for (const [key, val] of Object.entries(style)) {
      // biome-ignore lint/suspicious/noExplicitAny: CSSStyleDeclarationの型定義が厳しすぎるため、anyでキャストして代入する
      (this.element.style as any)[key] = val ?? "";
    }
  }

  public clone(
    style: Partial<CSSStyleDeclaration> = {},
    parent: Pick<HTMLElement, "appendChild"> = document.body,
  ) {
    const clonedElement = this.element.cloneNode(true) as HTMLElement;
    clonedElement.removeAttribute("id");
    parent.appendChild(clonedElement);

    const src = new DomSource(clonedElement);
    src.apply(style);
    return src;
  }
}
