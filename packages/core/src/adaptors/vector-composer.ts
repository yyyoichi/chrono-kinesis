import type { SnapshotPort, VectorReadablePort } from "../ports";

export class VectorComposer implements VectorReadablePort {
  private _snapshot: number[] = [];
  private sources: VectorReadablePort[];
  constructor(...sources: VectorReadablePort[]) {
    this.sources = sources;
    this.snapshot();
  }
  public vector(): Readonly<number[]> {
    return this._snapshot;
  }
  public snapshot(): void {
    const vector = this.sources.reduce((acc, source) => {
      const v = source.vector();
      return acc.concat(v);
    }, [] as number[]);
    this._snapshot = vector;
  }
  public dependencies(): SnapshotPort[] {
    return this.sources;
  }
}
