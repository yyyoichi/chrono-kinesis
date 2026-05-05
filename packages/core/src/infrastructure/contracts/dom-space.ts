/**
 * 要素の座標・サイズの取得空間を定義します。
 * - `padding-box`: transform に非依存。padding-box 左上 / clientWidth, clientHeight。
 * - `border-box`: transform に非依存。border-box 左上 / offsetWidth, offsetHeight。
 * - `visual`: transform 適用後。見た目の矩形(getBoundingClientRect)基準。
 */
export type ElementRectSpace = "padding-box" | "border-box" | "visual";
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
export function getPositionReader(space: ElementRectSpace) {
  if (space === "padding-box") return readPaddingBoxPosition;
  if (space === "visual") return readVisualPosition;
  return readBorderBoxPosition;
}

/**
 * 取得空間に対応するサイズを返します。
 */
export function readElementSize(space: ElementRectSpace, element: HTMLElement): [number, number] {
  if (space === "padding-box") {
    return [element.clientWidth, element.clientHeight];
  }
  if (space === "visual") {
    const rect = element.getBoundingClientRect();
    return [rect.width, rect.height];
  }
  return [element.offsetWidth, element.offsetHeight];
}
