export interface SnapshotPort {
  snapshot(now: number): void;
  dependencies?(): SnapshotPort[];
}
