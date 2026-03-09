import type { SnapshotPort } from "../../domain/ports/snapshot-port";

export interface FrameSnapshotRegistry {
  snapshotAll(now: number): void;
  register(snapshot: SnapshotPort): void;
}
