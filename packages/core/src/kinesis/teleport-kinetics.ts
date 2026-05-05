import type { SnapshotPort, VectorReadablePort } from "../ports";
import { Kinetics } from "./kinetics";
import type { Options } from "./options";

/**
 * 初期座標が変更される Kinetics。
 * このインスタンスをTargetに登録するか、 コンストラクタで渡す vector をTargetに登録してください。
 */
export class TeleportKinetics extends Kinetics {
  // 初期座標 vector 。
  private readonly _vector: VectorReadablePort;
  // 現在の初期座標
  // snaphot時かcompute時に比較され、変更がある場合teleportされます。
  // いずれで変更されてもsnapshotが正しい限りteleportは正常に動作します。
  private _currentInit: Readonly<number[]> = [];
  private readonly _dependencies: SnapshotPort[];

  constructor(vector: VectorReadablePort, options: Options = {}) {
    super(vector.vector(), options);
    this._vector = vector;
    this._currentInit = vector.vector();
    this._dependencies = [vector];
  }

  public compute(dt: number, vector: Readonly<number[]>): void {
    this.updateCurrent();
    super.compute(dt, vector);
  }
  public snapshot(): void {
    this.updateCurrent();
    super.snapshot();
  }
  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }
  private updateCurrent() {
    const next = this._vector?.vector();
    if (this._currentInit === next) return;
    super.teleport(next);
    this._currentInit = next;
  }
}
