import type { SnapshotPort } from "../domain/ports/snapshot-port";

export class DefaultFrameSnapshotRegistry {
  private readonly registry = new Set<SnapshotPort>();
  private readonly lastVisited = new WeakMap<SnapshotPort, number>();

  // 原則は登録時固定 + 依存変更時に明示的に再登録
  public register(snapshot: SnapshotPort): void {
    const visiting = new Set<SnapshotPort>();
    const visited = new Set<SnapshotPort>();

    const visit = (node: SnapshotPort) => {
      if (visited.has(node)) return;
      if (visiting.has(node)) {
        throw new Error("Snapshot dependency cycle detected.");
      }

      visiting.add(node);
      const deps = node.dependencies?.() ?? [];
      for (const dep of deps) visit(dep);
      visiting.delete(node);

      visited.add(node);
      this.registry.add(node);
    };

    visit(snapshot);
  }

  public snapshotAll(now: number): void {
    for (const snapshot of this.registry) {
      if (this.lastVisited.get(snapshot) === now) continue;
      this.lastVisited.set(snapshot, now);
      snapshot.snapshot(now);
    }
  }
}
