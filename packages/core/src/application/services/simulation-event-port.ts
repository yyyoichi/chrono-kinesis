import type { DisposablePort, KineticsPort } from "../../domain/ports";

export interface KineticsEventPort extends DisposablePort {
  previous(kinetics: KineticsPort): void;
  current(kinetics: KineticsPort): void;
  commit(): void;
}
