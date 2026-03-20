import type { KineticsPort } from "../domain/ports";
import type { KineticsEventPort } from "./services/simulation-event-port";

type KineticsTransitionObserverEventType = "start" | "stop";

type KineticsTransitionObserverListener = (event: {
  type: KineticsTransitionObserverEventType;
}) => void;

export class KineticsTransitionObserver implements KineticsEventPort {
  private beforeActive: boolean | null = null;
  private afterActive: boolean | null = null;

  private readonly listeners: Record<
    KineticsTransitionObserverEventType,
    Set<KineticsTransitionObserverListener>
  > = {
    start: new Set(),
    stop: new Set(),
  };

  public previous(kinetics: KineticsPort): void {
    this.beforeActive = kinetics.isActive();
  }

  public current(kinetics: KineticsPort): void {
    this.afterActive = kinetics.isActive();
  }

  public commit(): void {
    const before = this.beforeActive;
    const after = this.afterActive;
    if (before === null || after === null) {
      this.reset();
      return;
    }
    if (!before && after) {
      this.emit("start");
      this.reset();
      return;
    }
    if (before && !after) {
      this.emit("stop");
      this.reset();
      return;
    }
  }

  public subscribe(
    type: KineticsTransitionObserverEventType,
    cb: KineticsTransitionObserverListener,
  ) {
    this.listeners[type].add(cb);
  }

  public unsubscribe(
    type: KineticsTransitionObserverEventType,
    cb: KineticsTransitionObserverListener,
  ) {
    this.listeners[type].delete(cb);
  }

  public destroy(): void {
    this.listeners.start.clear();
    this.listeners.stop.clear();
    this.reset();
  }

  private emit(type: KineticsTransitionObserverEventType): void {
    const event = {
      type,
    };

    for (const cb of this.listeners[type]) {
      cb(event);
    }
  }

  private reset(): void {
    this.beforeActive = null;
    this.afterActive = null;
  }
}
