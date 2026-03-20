import type { KineticsPort } from "../domain/ports";
import type {
  SimulationPhase,
  SimulationPhaseObserver,
} from "./services/simulation-phase-observer";

type KineticsTransitionEventType = "start" | "stop";

type KineticsTransitionListener = (event: { type: KineticsTransitionEventType }) => void;

type KineticsTransitionObserverOptions = {
  startThreshold?: number;
  stopThreshold?: number;
};

export class KineticsTransitionObserver implements SimulationPhaseObserver {
  private beforeScore: number | null = null;
  private readonly startThreshold: number;
  private readonly stopThreshold: number;

  private readonly listeners: Record<KineticsTransitionEventType, Set<KineticsTransitionListener>> =
    {
      start: new Set(),
      stop: new Set(),
    };

  constructor(
    private readonly kinetics: KineticsPort,
    options: KineticsTransitionObserverOptions = {},
  ) {
    this.startThreshold = Math.max(
      0,
      Number.isFinite(options.startThreshold) ? (options.startThreshold as number) : 0.5,
    );
    this.stopThreshold = Math.max(
      0,
      Number.isFinite(options.stopThreshold) ? (options.stopThreshold as number) : 0.5,
    );
  }

  public notify(phase: SimulationPhase): void {
    if (phase === "snapshotted") {
      this.beforeScore = this.kinetics.activityScore;
      return;
    }
    if (phase === "computed") {
      const before = this.beforeScore;
      const after = this.kinetics.activityScore;
      if (before === null) return;
      if (before < this.startThreshold && after >= this.startThreshold) {
        this.emit("start");
      } else if (before >= this.stopThreshold && after < this.stopThreshold) {
        this.emit("stop");
      }
      this.beforeScore = null;
    }
  }

  public subscribe(type: KineticsTransitionEventType, cb: KineticsTransitionListener) {
    this.listeners[type].add(cb);
  }

  public unsubscribe(type: KineticsTransitionEventType, cb: KineticsTransitionListener) {
    this.listeners[type].delete(cb);
  }

  public destroy(): void {
    this.listeners.start.clear();
    this.listeners.stop.clear();
    this.beforeScore = null;
  }

  private emit(type: KineticsTransitionEventType): void {
    const event = { type };
    for (const cb of this.listeners[type]) {
      cb(event);
    }
  }
}
