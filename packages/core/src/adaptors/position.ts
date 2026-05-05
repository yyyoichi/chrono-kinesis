import type {
  GateReadablePort,
  PositionReadablePort,
  RatioReadablePort,
  ScalarReadablePort,
  SizeReadablePort,
  SnapshotPort,
  VectorReadablePort,
} from "../ports";
import { resolvePosition, resolveRatio, resolveScalar, resolveSize } from "./resolver";

/** 矩形の左上座標と幅高さから、矩形の中心点を返します */
export class BoxCenterPosition implements PositionReadablePort, VectorReadablePort {
  private readonly source: BoxRelativePosition;
  constructor(
    private readonly positionSource: PositionReadablePort, // 矩形の左上座標
    private readonly sizeSource: SizeReadablePort,
  ) {
    this.source = new BoxRelativePosition(this.positionSource, this.sizeSource, 0.5, 0.5);
  }
  public snapshot() {
    this.source.snapshot();
  }
  public position(): Readonly<[number, number]> {
    return this.source.position();
  }
  public vector(): Readonly<number[]> {
    return this.source.vector();
  }
  public dependencies(): SnapshotPort[] {
    return this.source.dependencies();
  }
}

/** 矩形の左上座標と幅高さから、任意の相対位置（rate: 0〜1）を返します。
 * x=0.5, y=0.5 で BoxCenterPosition と等価になります。
 * x/y に RatioReadablePort を渡すと snapshot ごとに動的な rate を使えます。
 */
export class BoxRelativePosition implements PositionReadablePort, VectorReadablePort {
  private _snapshot: [number, number] = [0, 0];
  private readonly getXRatio: () => number;
  private readonly getYRatio: () => number;
  private readonly _dependencies: SnapshotPort[];

  constructor(
    private readonly positionSource: PositionReadablePort,
    private readonly sizeSource: SizeReadablePort,
    /** x方向の位置（rate）。0=左端, 0.5=中央, 1.0=右端。数値固定またはRatioReadablePortで動的に指定できます。 */
    x: number | RatioReadablePort,
    /** y方向の位置（rate）。0=上端, 0.5=中央, 1.0=下端。数値固定またはRatioReadablePortで動的に指定できます。 */
    y: number | RatioReadablePort,
  ) {
    const { getter: getX, port: xPort } = resolveRatio(x);
    const { getter: getY, port: yPort } = resolveRatio(y);
    const ratioPorts = [xPort, yPort].filter((p): p is RatioReadablePort => p !== null);
    this.getXRatio = getX;
    this.getYRatio = getY;
    this._dependencies = [positionSource, sizeSource, ...ratioPorts];
    this.snapshot();
  }

  public snapshot() {
    const [x, y] = this.positionSource.position();
    const [width, height] = this.sizeSource.size();
    this._snapshot = [x + width * this.getXRatio(), y + height * this.getYRatio()];
  }

  public position(): Readonly<[number, number]> {
    return this._snapshot;
  }

  public vector(): Readonly<number[]> {
    return this._snapshot;
  }

  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }
}

/** 指定した点を中心として、矩形サイズ分オフセットした左上座標を返します。
 * 要素のポインタ追従や中央配置のターゲット計算に使います。
 */
export class CenterAlignedPosition implements PositionReadablePort, VectorReadablePort {
  private readonly source: RelativeAlignedPosition;

  constructor(
    private readonly positionSource: PositionReadablePort, // 中心に来てほしい点
    private readonly sizeSource: SizeReadablePort, // 配置する矩形
  ) {
    this.source = new RelativeAlignedPosition(this.positionSource, this.sizeSource, 0.5, 0.5);
  }

  public snapshot() {
    this.source.snapshot();
  }

  public position(): Readonly<[number, number]> {
    return this.source.position();
  }

  public vector(): Readonly<number[]> {
    return this.source.vector();
  }

  public dependencies(): SnapshotPort[] {
    return this.source.dependencies();
  }
}

/** 指定した点を基準として、矩形サイズ分オフセットした左上座標を返します。
 * x=0.5, y=0.5 で CenterAlignedPosition と等価になります。
 * x/y に RatioReadablePort を渡すと snapshot ごとに動的な rate を使えます。
 */
export class RelativeAlignedPosition implements PositionReadablePort, VectorReadablePort {
  private _snapshot: [number, number] = [0, 0];
  private readonly getXRatio: () => number;
  private readonly getYRatio: () => number;
  private readonly _dependencies: SnapshotPort[];

  constructor(
    private readonly positionSource: PositionReadablePort,
    private readonly sizeSource: SizeReadablePort,
    /** x方向の位置（rate）。0=左端, 0.5=中央, 1.0=右端。数値固定またはRatioReadablePortで動的に指定できます。 */
    x: number | RatioReadablePort,
    /** y方向の位置（rate）。0=上端, 0.5=中央, 1.0=下端。数値固定またはRatioReadablePortで動的に指定できます。 */
    y: number | RatioReadablePort,
  ) {
    const { getter: getX, port: xPort } = resolveRatio(x);
    const { getter: getY, port: yPort } = resolveRatio(y);
    const ratioPorts = [xPort, yPort].filter((p): p is RatioReadablePort => p !== null);
    this.getXRatio = getX;
    this.getYRatio = getY;
    this._dependencies = [positionSource, sizeSource, ...ratioPorts];
    this.snapshot();
  }

  public snapshot() {
    const [x, y] = this.positionSource.position();
    const [width, height] = this.sizeSource.size();
    this._snapshot = [x - width * this.getXRatio(), y - height * this.getYRatio()];
  }

  public position(): Readonly<[number, number]> {
    return this._snapshot;
  }

  public vector(): Readonly<number[]> {
    return this._snapshot;
  }

  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }
}

export class FixedPosition implements VectorReadablePort, PositionReadablePort {
  private _snapshot: Readonly<[number, number]> = [0, 0];
  constructor(position: ReturnType<PositionReadablePort["position"]>) {
    this._snapshot = [...position];
  }
  public snapshot(): void {}
  public position(): Readonly<[number, number]> {
    return this._snapshot;
  }
  public vector(): Readonly<number[]> {
    return this._snapshot;
  }
}

export class OffsetPosition implements PositionReadablePort, VectorReadablePort {
  private readonly getLeftPx: () => number;
  private readonly getTopPx: () => number;
  private readonly _dependencies: SnapshotPort[];
  private _snapshot: [number, number] = [0, 0];

  constructor(
    private readonly source: PositionReadablePort,
    /** x方向オフセット(px)。固定値 or ScalarReadablePort。 */
    leftPx?: number | ScalarReadablePort,
    /** y方向オフセット(px)。固定値 or ScalarReadablePort。 */
    topPx?: number | ScalarReadablePort,
  ) {
    const { getter: getLeftPx, port: leftPort } = resolveScalar(leftPx);
    const { getter: getTopPx, port: topPort } = resolveScalar(topPx);
    this.getLeftPx = getLeftPx;
    this.getTopPx = getTopPx;
    const scalarPort = [leftPort, topPort].filter((p): p is ScalarReadablePort => p !== null);
    this._dependencies = [this.source, ...scalarPort];
    this.snapshot();
  }

  public snapshot(): void {
    const [x, y] = this.source.position();
    this._snapshot = [x + this.getLeftPx(), y + this.getTopPx()];
  }
  public position(): Readonly<[number, number]> {
    return this._snapshot;
  }
  public vector(): Readonly<number[]> {
    return this._snapshot;
  }
  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }
}

// positionが特定の領域内にあるかどうかをGateで返す。
export class PositionInRegionGate implements GateReadablePort {
  private _snapshot: 0 | 1 = 0;
  private readonly getRegionTopLeft: () => Readonly<[number, number]>;
  private readonly getRegionSize: () => Readonly<[number, number]>;
  private _dependencies: SnapshotPort[] = [];
  constructor(
    private readonly position: PositionReadablePort,
    regionTopLeft: PositionReadablePort | ReturnType<PositionReadablePort["position"]>,
    regionSize: SizeReadablePort | ReturnType<SizeReadablePort["size"]>,
  ) {
    const { getter: getRegionTopLeft, port: regionTopLeftPort } = resolvePosition(regionTopLeft);
    const { getter: getRegionSize, port: regionSizePort } = resolveSize(regionSize);
    this.getRegionTopLeft = getRegionTopLeft;
    this.getRegionSize = getRegionSize;
    const regionPorts = [regionTopLeftPort, regionSizePort].filter(
      (p): p is PositionReadablePort | SizeReadablePort => p !== null,
    );
    this._dependencies = [position, ...regionPorts];
    this.snapshot();
  }
  public snapshot(): void {
    const [px, py] = this.position.position();
    const [rx, ry] = this.getRegionTopLeft();
    const [rw, rh] = this.getRegionSize();
    this._snapshot = rx <= px && px <= rx + rw && ry <= py && py <= ry + rh ? 1 : 0;
  }
  public get gate(): Readonly<0 | 1> {
    return this._snapshot;
  }
  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }
}
