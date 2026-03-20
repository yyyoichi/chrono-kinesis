import type { SimulationContext } from "./services/simulation-context";
import type { SimulatorService } from "./services/simulator-service";
import { DefaultFrameSnapshotRegistry } from "./snapshot-registry";

type SimulatorOptions = {
  // 物理演算のステップ時間（秒）。小さすぎるとCPU負荷が高くなり、大きすぎると物理演算が不安定になる可能性がある。デフォルトは1/60秒（約16.67ms）。
  fixedStepSec?: number;
};

export class DefaultSimulatorService implements SimulatorService {
  private static readonly DEFAULT_FIXED_STEP_SEC = 1 / 60;
  private static readonly MAX_FRAME_DELTA_SEC = 0.05;

  private contexts: SimulationContext[] = [];
  private frameId: number | null = null;
  private state: "idle" | "running" | "paused" = "idle";
  private lastFrameTimeMs = 0;
  private accumulatedLagSec = 0;
  private fixedStepSec: number;

  private snapshots = new DefaultFrameSnapshotRegistry();

  constructor(options: SimulatorOptions = {}) {
    this.fixedStepSec = DefaultSimulatorService.DEFAULT_FIXED_STEP_SEC;
    this.setFixedStepSec(options.fixedStepSec ?? DefaultSimulatorService.DEFAULT_FIXED_STEP_SEC);
  }

  public add(context: SimulationContext): void {
    const isAlreadyAdded = this.contexts.some(({ target }) => target === context.target);
    if (!isAlreadyAdded) {
      context.clock.onHeartbeat(() => setTimeout(this.wake.bind(this), 0));
    }
    this.snapshots.register(context.target);
    this.contexts.push(context);
  }

  public run(): void {
    if (this.state === "running") {
      return;
    }
    console.debug("[Simulator] Starting simulation");
    this.state = "running";
    this.lastFrameTimeMs = performance.now();
    this.accumulatedLagSec = 0;
    this.frameId = requestAnimationFrame((now) => {
      this.step(now);
    });
  }

  private wake(): void {
    if (this.state === "running" || this.state === "idle") {
      return;
    }
    console.debug("[Simulator] Wake up from heartbeat");
    this.state = "running";
    this.lastFrameTimeMs = performance.now();
    this.accumulatedLagSec = 0;
    this.frameId = requestAnimationFrame((now) => {
      this.step(now);
    });
  }

  public pause(): void {
    if (this.state === "paused") {
      return;
    }
    console.debug("[Simulator] Pausing simulation");
    this.state = "paused";
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.lastFrameTimeMs = 0;
    this.accumulatedLagSec = 0;
  }

  public destroy(): void {
    this.pause();
    for (const { clock, disposables, phaseObservers } of this.contexts) {
      clock.destroy();
      for (const d of disposables || []) {
        d.destroy();
      }
      for (const o of phaseObservers || []) {
        o.destroy();
      }
    }
    this.contexts = [];
  }

  public manualStep(delta: number): void {
    this.applyStep(delta, performance.now());
  }

  private step(now: number): void {
    if (this.state !== "running") {
      return;
    }

    const elapsedSec = this.lastFrameTimeMs === 0 ? 0 : (now - this.lastFrameTimeMs) / 1000;
    this.lastFrameTimeMs = now;

    // 1. 最大値を制限しつつ蓄積（ラグ対策）
    this.accumulatedLagSec += Math.min(elapsedSec, DefaultSimulatorService.MAX_FRAME_DELTA_SEC);

    // 2. 蓄積された時間が1ステップ分を超えている間、物理を回す
    while (this.accumulatedLagSec >= this.fixedStepSec) {
      this.applyStep(this.fixedStepSec, now);
      this.accumulatedLagSec -= this.fixedStepSec;
    }

    // 3. 継続判定
    if (this.isGlobalClockActive() || this.isGlobalKineticsActive()) {
      this.frameId = requestAnimationFrame((time) => this.step(time));
    } else {
      this.pause();
    }
  }

  private applyStep(delta: number, now: number): void {
    this.snapshots.snapshotAll(now);

    for (const { clock, kinetics, target, phaseObservers } of this.contexts) {
      if (phaseObservers) {
        for (const o of phaseObservers) o.notify("snapshotted");
      }

      if (!clock.isActive() && !kinetics.isActive()) {
        continue;
      }

      kinetics.compute(delta, target.vector());

      if (phaseObservers) {
        for (const o of phaseObservers) o.notify("computed");
      }
    }

    for (const { kinetics, physics } of this.contexts) {
      if (!kinetics.isActive()) {
        continue;
      }
      if (Array.isArray(physics)) {
        for (const p of physics) {
          p.apply(kinetics.state);
        }
        continue;
      }
      physics.apply(kinetics.state);
    }
  }

  public setFixedStepSec(fixedStepSec: number): void {
    if (fixedStepSec <= 0 || !Number.isFinite(fixedStepSec)) {
      throw new Error("fixedStepSec must be a positive finite number.");
    }
    this.fixedStepSec = fixedStepSec;
  }

  // いずれかのkineticsがactiveかどうか
  private isGlobalKineticsActive(): boolean {
    for (const { kinetics } of this.contexts) {
      if (kinetics.isActive()) return true;
    }
    return false;
  }
  // いずれかのclockがactiveかどうか
  private isGlobalClockActive(): boolean {
    for (const { clock } of this.contexts) {
      if (clock.isActive()) return true;
    }
    return false;
  }
}
