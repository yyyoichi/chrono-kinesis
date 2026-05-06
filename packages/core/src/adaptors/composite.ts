import type { ClockPort, DisposablePort, SnapshotPort, VectorReadablePort } from "../ports";

/**
 * VectorReadablePortとsnapshotの対象には含めたいPortをまとめるためのクラス。
 * @param source vector()で利用されるVectorReadablePort
 * @param snapshots vectorとして利用しないがsnapshotの対象となるSnapshotPort群
 */
export class VectorWithSnapshots implements VectorReadablePort {
  private readonly _dependencies: SnapshotPort[];
  constructor(
    private readonly source: VectorReadablePort,
    ...snapshots: SnapshotPort[]
  ) {
    this._dependencies = snapshots;
  }
  public vector(): Readonly<number[]> {
    return this.source.vector();
  }
  public snapshot(now: number): void {
    this.source.snapshot(now);
  }
  public dependencies(): SnapshotPort[] {
    return this._dependencies;
  }
}

/**
 * ClockとdestroyされるべきDisposablePort群をまとめるためのクラス。
 * @param clock Clockとして利用されるClockPort
 * @param disposables Clockとして利用しないが、destroyの対象には含めたいDisposablePort群
 */
export class ClockWithDisposables implements ClockPort {
  private readonly _disposables: DisposablePort[];
  constructor(
    private readonly clock: ClockPort,
    ...disposables: DisposablePort[]
  ) {
    this._disposables = disposables;
  }
  public onHeartbeat(cb: () => void): void {
    this.clock.onHeartbeat(cb);
  }
  public isActive(): boolean {
    return this.clock.isActive();
  }
  public destroy(): void {
    this.clock.destroy();
    for (const disposable of this._disposables) {
      disposable.destroy();
    }
  }
}
