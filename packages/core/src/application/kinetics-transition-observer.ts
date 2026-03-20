import type { KineticsPort } from "../domain/ports";
import type {
  SimulationPhase,
  SimulationPhaseObserver,
} from "./services/simulation-phase-observer";

type KineticsTransitionEventType = "start" | "stop";

type KineticsTransitionListener = (event: { type: KineticsTransitionEventType }) => void;

export class KineticsTransitionObserver implements SimulationPhaseObserver {
  private beforeActive: boolean | null = null;

  private readonly listeners: Record<KineticsTransitionEventType, Set<KineticsTransitionListener>> =
    {
      start: new Set(),
      stop: new Set(),
    };

  constructor(private readonly kinetics: KineticsPort) {}

  public notify(phase: SimulationPhase): void {
    if (phase === "snapshotted") {
      this.beforeActive = this.kinetics.isActive();
      return;
    }
    if (phase === "computed") {
      const before = this.beforeActive;
      const after = this.kinetics.isActive();
      if (before === null) return;
      if (!before && after) {
        this.emit("start");
      } else if (before && !after) {
        this.emit("stop");
      }
      this.beforeActive = null;
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
    this.beforeActive = null;
  }

  private emit(type: KineticsTransitionEventType): void {
    const event = { type };
    for (const cb of this.listeners[type]) {
      cb(event);
    }
  }
}
