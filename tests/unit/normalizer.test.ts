import { describe, expect, it } from 'vitest';
import {
  MIDDLE_MCP, WRIST, normalizeHand, poseDistance, poseFeatures, poseVector, POSE_KEYS,
} from '../../src/lib/sign/normalizer';
import { buildHand, SHAPES } from '../../src/lib/sign/handModel';

describe('normalizeHand', () => {
  it('puts the wrist at the origin', () => {
    const hand = normalizeHand(buildHand(SHAPES.openPalm, { cx: 0.31, cy: 0.77 }))!;
    expect(hand.points[WRIST].x).toBeCloseTo(0, 10);
    expect(hand.points[WRIST].y).toBeCloseTo(0, 10);
  });

  it('scales the wrist → middle-knuckle distance to exactly 1', () => {
    const hand = normalizeHand(buildHand(SHAPES.fist, { scale: 0.07 }))!;
    const p = hand.points[MIDDLE_MCP];
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 6);
  });

  it('aligns the reference axis to "up"', () => {
    const hand = normalizeHand(buildHand(SHAPES.openPalm, { rotation: 37 }))!;
    const p = hand.points[MIDDLE_MCP];
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(-1, 6);
  });

  it('is invariant to where the hand is, how big it is, and how it is tilted', () => {
    const a = poseFeatures(normalizeHand(buildHand(SHAPES.openPalm, { cx: 0.2, cy: 0.3, scale: 0.08 }))!);
    const b = poseFeatures(normalizeHand(buildHand(SHAPES.openPalm, { cx: 0.8, cy: 0.7, scale: 0.19, rotation: -52 }))!);
    for (const key of POSE_KEYS) {
      expect(b[key]).toBeCloseTo(a[key], 5);
    }
  });

  it('refuses a hand that is too small or incomplete to read', () => {
    expect(normalizeHand([])).toBeNull();
    const degenerate = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    expect(normalizeHand(degenerate)).toBeNull();
  });
});

describe('pose fingerprints', () => {
  it('separates an open palm from a fist', () => {
    const open = poseFeatures(normalizeHand(buildHand(SHAPES.openPalm))!);
    const fist = poseFeatures(normalizeHand(buildHand(SHAPES.fist))!);
    expect(open.index).toBeGreaterThan(fist.index + 0.8);
    expect(open.spread).toBeGreaterThan(fist.spread);
  });

  it('separates a thumb-up fist from a plain fist mostly by the thumb', () => {
    const fist = poseFeatures(normalizeHand(buildHand(SHAPES.fist))!);
    const thumbUp = poseFeatures(normalizeHand(buildHand(SHAPES.thumbUpFist))!);
    expect(thumbUp.thumb - fist.thumb).toBeGreaterThan(0.5);
    expect(Math.abs(thumbUp.middle - fist.middle)).toBeLessThan(0.05);
  });

  it('produces a vector in POSE_KEYS order', () => {
    const f = poseFeatures(normalizeHand(buildHand(SHAPES.fist))!);
    expect(poseVector(f)).toEqual(POSE_KEYS.map(k => f[k]));
  });

  it('measures zero distance from a fingerprint to itself', () => {
    const f = poseFeatures(normalizeHand(buildHand(SHAPES.flatHand))!);
    expect(poseDistance(f, f, POSE_KEYS.map(() => 1))).toBeCloseTo(0, 10);
  });

  it('ignores features whose weight is zero', () => {
    const a = poseFeatures(normalizeHand(buildHand(SHAPES.openPalm))!);
    const b = { ...a, palmSide: a.palmSide + 5 };
    const weights = POSE_KEYS.map(k => (k === 'palmSide' ? 0 : 1));
    expect(poseDistance(a, b, weights)).toBeCloseTo(0, 10);
  });
});
