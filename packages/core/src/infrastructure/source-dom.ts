import type {
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
