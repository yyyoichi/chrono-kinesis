import type { SnapshotPort } from "./snapshot-port";

export interface GateReadablePort extends SnapshotPort {
  readonly gate: 0 | 1;
}

export interface ProgressReadablePort extends SnapshotPort {
  readonly progress: number; // 0..1
}

export interface TriggerReadablePort extends SnapshotPort {
  readonly trigger: 0 | 1;
}

export interface ScalarReadablePort extends SnapshotPort {
  readonly scalar: number; // unbounded continuous
}

export interface PositionReadablePort extends SnapshotPort {
  position(): Readonly<[number, number]>;
}

export interface SizeReadablePort extends SnapshotPort {
  size(): Readonly<[number, number]>;
}

/** 0〜1 の比率を提供するポート。position や size を入力として動的な ratio 計算に使います。 */
export interface RatioReadablePort extends SnapshotPort {
  readonly ratio: number; // 0..1
}

export interface VectorReadablePort extends SnapshotPort {
  vector(): Readonly<number[]>;
}
