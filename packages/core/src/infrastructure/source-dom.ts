import type { PositionReadablePort, SizeReadablePort, VectorReadablePort } from "../domain/ports";
import type { DomPhysicsSource } from "./contracts/dom-physics-source";

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
    this._snapshot.absolute = [rect.left + window.scrollX, rect.top + window.scrollY];
    this._snapshot.size = [rect.width, rect.height];
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
