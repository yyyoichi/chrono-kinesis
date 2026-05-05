import type { PositionReadablePort } from "../ports";
import { Kinetics } from "./kinetics";
import type { Options } from "./options";

// 明示的にベクトル[0, 1]を[x, y]のPositionとしてKineticsを利用するクラス。
export class PositionKinetics extends Kinetics implements PositionReadablePort {
  constructor(absolute: Readonly<[number, number]> | Readonly<number[]>, options: Options = {}) {
    const length = absolute.length;
    if (length < 2) {
      throw new Error("PositionKinetics requires at least 2 dimensions");
    }
    super(absolute, options);
  }
  public position(): Readonly<[number, number]> {
    const [x, y] = this.vector();
    return [x, y];
  }
}
