import type {
  PositionReadablePort,
  RatioReadablePort,
  ScalarReadablePort,
  SizeReadablePort,
} from "../ports";

export function resolvePosition(
  raw: PositionReadablePort | ReturnType<PositionReadablePort["position"]>,
  fallback: Readonly<[number, number]> = [0, 0],
): { getter: () => Readonly<[number, number]>; port: PositionReadablePort | null } {
  if (raw && typeof raw === "object" && "position" in raw && typeof raw.position === "function") {
    return { getter: () => raw.position(), port: raw };
  }
  if (Array.isArray(raw) && raw.length === 2) {
    const [x, y] = raw;
    return { getter: () => [x, y], port: null };
  }
  return { getter: () => fallback, port: null };
}

export function resolveSize(
  raw: SizeReadablePort | ReturnType<SizeReadablePort["size"]>,
  fallback: Readonly<[number, number]> = [0, 0],
): {
  getter: () => Readonly<[number, number]>;
  port: SizeReadablePort | null;
} {
  if (raw && typeof raw === "object" && "size" in raw && typeof raw.size === "function") {
    return { getter: () => raw.size(), port: raw };
  }
  if (Array.isArray(raw) && raw.length === 2) {
    const [w, h] = raw;
    return { getter: () => [w, h], port: null };
  }
  return { getter: () => fallback, port: null };
}

export function resolveScalar(
  raw: number | ScalarReadablePort | undefined,
  fallback = 0,
): { getter: () => number; port: ScalarReadablePort | null } {
  if (raw && typeof raw === "object") {
    return { getter: () => raw.scalar, port: raw };
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { getter: () => raw, port: null };
  }
  if (Number.isFinite(fallback)) {
    return { getter: () => fallback, port: null };
  }
  return { getter: () => 0, port: null };
}

/** number | RatioReadablePort を () => number に解決するヘルパー。
 * 数値の場合はコンストラクタ時に 0〜1 へ clamp して固定クロージャを返します。
 * RatioReadablePort の場合はポートを返し、snapshot ごとに ratio を読みます。
 */
export function resolveRatio(
  raw: number | RatioReadablePort | undefined,
  fallback = 0.5,
): { getter: () => number; port: RatioReadablePort | null } {
  if (raw && typeof raw === "object") {
    return { getter: () => raw.ratio, port: raw };
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const clamped = Math.max(0, Math.min(1, raw));
    return { getter: () => clamped, port: null };
  }
  if (Number.isFinite(fallback)) {
    const clamped = Math.max(0, Math.min(1, fallback));
    return { getter: () => clamped, port: null };
  }
  return { getter: () => 0, port: null };
}
