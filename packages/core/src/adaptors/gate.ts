import type { GateReadablePort, SnapshotPort, VectorReadablePort } from "../ports";

export class GateConditionalVector implements VectorReadablePort {
  private _snapshot: Readonly<number[]> = [];
  constructor(
    private readonly gate: GateReadablePort,
    private readonly trueVector: VectorReadablePort,
    private readonly falseVector: VectorReadablePort,
  ) {
    this.snapshot();
  }
  public snapshot(): void {
    const gateValue = this.gate.gate;
    this._snapshot = gateValue === 1 ? this.trueVector.vector() : this.falseVector.vector();
  }
  public vector(): Readonly<number[]> {
    return this._snapshot;
  }
  public dependencies(): SnapshotPort[] {
    return [this.gate, this.trueVector, this.falseVector];
  }
}
