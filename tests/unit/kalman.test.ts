import { describe, expect, it } from 'vitest';
import { Kalman1D, LandmarkSmoother, variance } from '../../src/lib/sign/kalman';
import { buildHand, SHAPES } from '../../src/lib/sign/handModel';

const DT = 1 / 30;

/**
 * A hand movement as the detector sees it: the intended trajectory, a
 * physiological tremor riding on top of it, and per-frame detector noise.
 */
function tremblingHand(n: number, hz = 0.5, amplitude = 0.08, tremor = 0.02, noise = 0.005) {
  let state = 3;
  const rnd = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return (state / 0xffffffff) * 2 - 1;
  };
  const clean: number[] = [];
  const dirty: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / 30;
    const v = amplitude * Math.sin(t * Math.PI * 2 * hz);
    clean.push(v);
    dirty.push(v + tremor * Math.sin(t * Math.PI * 2 * 6.3 + 1.1) + rnd() * noise);
  }
  return { clean, dirty };
}

describe('Kalman1D', () => {
  it('halves the error against the intended trajectory of a trembling hand', () => {
    const { clean, dirty } = tremblingHand(240);
    const k = new Kalman1D();
    const filtered = dirty.map(v => k.filter(v, DT));

    // Skip the settling frames: the filter starts from the first measurement.
    const before = variance(dirty.slice(20).map((v, i) => v - clean[i + 20]));
    const after = variance(filtered.slice(20).map((v, i) => v - clean[i + 20]));

    expect(after).toBeLessThan(before * 0.6);
  });

  it('follows the movement instead of flattening it', () => {
    const { clean, dirty } = tremblingHand(240);
    const k = new Kalman1D();
    const filtered = dirty.map(v => k.filter(v, DT));
    // Smoothing must not become "stand still", or a slow sign would disappear
    // along with the tremor.
    const spanClean = Math.max(...clean) - Math.min(...clean);
    const spanFiltered = Math.max(...filtered) - Math.min(...filtered);
    expect(spanFiltered).toBeGreaterThan(spanClean * 0.8);
  });

  it('still tracks a fast 2 Hz movement without inverting it', () => {
    const { clean, dirty } = tremblingHand(120, 2);
    const k = new Kalman1D();
    const filtered = dirty.map(v => k.filter(v, DT));
    const spanFiltered = Math.max(...filtered.slice(20)) - Math.min(...filtered.slice(20));
    const spanClean = Math.max(...clean) - Math.min(...clean);
    expect(spanFiltered).toBeGreaterThan(spanClean * 0.5);
  });

  it('keeps lag bounded on a ramp', () => {
    const k = new Kalman1D();
    let last = 0;
    for (let i = 0; i < 120; i++) last = k.filter(i * 0.01, DT);
    // After a second of constant velocity the estimate is within a few frames
    // of the true value, because the model tracks velocity, not just position.
    expect(Math.abs(last - 119 * 0.01)).toBeLessThan(0.05);
  });

  it('starts at the first measurement rather than at zero', () => {
    const k = new Kalman1D();
    expect(k.filter(5, DT)).toBe(5);
  });
});

describe('LandmarkSmoother', () => {
  it('exposes raw and stabilized landmarks at the same time', () => {
    const smoother = new LandmarkSmoother();
    const hand = buildHand(SHAPES.openPalm, { jitter: 0.01, seed: 11 });
    const out = smoother.push(hand, DT);
    expect(smoother.raw).toBe(hand);
    expect(smoother.smoothed).toBe(out);
    expect(out).toHaveLength(21);
  });

  it('shrinks per-landmark jitter across a still hand', () => {
    const smoother = new LandmarkSmoother();
    const rawX: number[] = [];
    const smoothX: number[] = [];
    for (let i = 0; i < 90; i++) {
      const hand = buildHand(SHAPES.openPalm, { jitter: 0.01, seed: i + 1 });
      const out = smoother.push(hand, DT);
      rawX.push(hand[8].x);
      smoothX.push(out[8].x);
    }
    // Ignore the settling frames at the start.
    expect(variance(smoothX.slice(15))).toBeLessThan(variance(rawX.slice(15)) * 0.5);
  });

  it('forgets everything on reset, so a new hand is not smoothed toward the old one', () => {
    const smoother = new LandmarkSmoother();
    smoother.push(buildHand(SHAPES.fist, { cx: 0.2 }), DT);
    smoother.reset();
    const fresh = buildHand(SHAPES.fist, { cx: 0.8 });
    const out = smoother.push(fresh, DT);
    expect(out[0].x).toBeCloseTo(fresh[0].x, 6);
  });
});
