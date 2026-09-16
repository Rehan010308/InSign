/**
 * A 1D constant-velocity Kalman filter, one instance per coordinate stream.
 *
 * State is [position, velocity]. The model assumes the coordinate moves at a
 * roughly constant velocity between frames and that the measurement is noisy —
 * which is exactly what a trembling hand looks like to a landmark detector.
 * Tremor is high-frequency noise around a slow trajectory, so the filter keeps
 * the trajectory and absorbs the tremor without asking the hand to be still.
 */
export class Kalman1D {
  /** estimated position */
  private x = 0;
  /** estimated velocity */
  private v = 0;
  /** covariance matrix P = [[p00, p01], [p10, p11]] */
  private p00 = 1;
  private p01 = 0;
  private p10 = 0;
  private p11 = 1;
  private initialized = false;

  constructor(
    /**
     * Process noise — how much the constant-velocity assumption is allowed to
     * be wrong per step. Higher tracks fast motion, lower smooths harder.
     */
    public processNoise = 0.2,
    /**
     * Measurement noise — how much the landmark detector is distrusted.
     * The defaults were tuned against a 0.5-1 Hz hand movement carrying a
     * 6 Hz tremor: they cut the error against the intended trajectory by
     * roughly half without visibly lagging the hand (see tests/unit/kalman).
     */
    public measurementNoise = 0.006
  ) {}

  reset(): void {
    this.initialized = false;
    this.x = 0;
    this.v = 0;
    this.p00 = this.p11 = 1;
    this.p01 = this.p10 = 0;
  }

  get value(): number {
    return this.x;
  }

  get velocity(): number {
    return this.v;
  }

  /** One predict + update step. `dt` in seconds. */
  filter(measurement: number, dt = 1 / 30): number {
    if (!this.initialized) {
      this.initialized = true;
      this.x = measurement;
      this.v = 0;
      return this.x;
    }

    // --- predict: x = F x, P = F P Fᵀ + Q  with F = [[1, dt], [0, 1]]
    this.x += this.v * dt;

    const p00 = this.p00 + dt * (this.p10 + this.p01) + dt * dt * this.p11;
    const p01 = this.p01 + dt * this.p11;
    const p10 = this.p10 + dt * this.p11;
    const p11 = this.p11;

    const q = this.processNoise;
    this.p00 = p00 + q * dt;
    this.p01 = p01;
    this.p10 = p10;
    this.p11 = p11 + q;

    // --- update: K = P Hᵀ (H P Hᵀ + R)⁻¹  with H = [1, 0]
    const s = this.p00 + this.measurementNoise;
    const k0 = this.p00 / s;
    const k1 = this.p10 / s;

    const innovation = measurement - this.x;
    this.x += k0 * innovation;
    this.v += k1 * innovation;

    const p00n = (1 - k0) * this.p00;
    const p01n = (1 - k0) * this.p01;
    const p10n = this.p10 - k1 * this.p00;
    const p11n = this.p11 - k1 * this.p01;
    this.p00 = p00n;
    this.p01 = p01n;
    this.p10 = p10n;
    this.p11 = p11n;

    return this.x;
  }
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type LandmarkFrame = Landmark[];

export const LANDMARK_COUNT = 21;

/**
 * Smooths a full 21-point hand (x, y, z) while keeping the unsmoothed values
 * available — the sign stage draws RAW and STABILIZED at the same time, so the
 * filtering has to be visible rather than merely claimed.
 */
export class LandmarkSmoother {
  private filters: Kalman1D[];
  private lastRaw: LandmarkFrame | null = null;
  private lastSmoothed: LandmarkFrame | null = null;

  constructor(processNoise = 0.2, measurementNoise = 0.006) {
    this.filters = Array.from(
      { length: LANDMARK_COUNT * 3 },
      () => new Kalman1D(processNoise, measurementNoise)
    );
  }

  reset(): void {
    this.filters.forEach(f => f.reset());
    this.lastRaw = null;
    this.lastSmoothed = null;
  }

  get raw(): LandmarkFrame | null {
    return this.lastRaw;
  }

  get smoothed(): LandmarkFrame | null {
    return this.lastSmoothed;
  }

  push(frame: LandmarkFrame, dt = 1 / 30): LandmarkFrame {
    const out: LandmarkFrame = new Array(frame.length);
    for (let i = 0; i < frame.length && i < LANDMARK_COUNT; i++) {
      out[i] = {
        x: this.filters[i * 3].filter(frame[i].x, dt),
        y: this.filters[i * 3 + 1].filter(frame[i].y, dt),
        z: this.filters[i * 3 + 2].filter(frame[i].z, dt),
      };
    }
    this.lastRaw = frame;
    this.lastSmoothed = out;
    return out;
  }
}

/** Sample variance — used by the tests that prove the filter actually smooths. */
export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
}
