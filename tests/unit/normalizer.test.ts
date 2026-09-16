import { describe, expect, it } from 'vitest';
import {
  MIDDLE_MCP, WRIST, normalizeHand, poseAgreement, poseDistance, poseFeatures, poseVector, POSE_KEYS,
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

describe('the features that separate the shapes', () => {
  const fp = (shape: Parameters<typeof buildHand>[0]) =>
    poseFeatures(normalizeHand(buildHand(shape))!);

  it('tells a flat hand from an open palm by the gaps between the fingers', () => {
    // Both have every finger extended, so tip-to-wrist distances are identical.
    // Without the gap features these two shapes were nearly indistinguishable,
    // which is what let GOOD fire at an open palm.
    const open = fp(SHAPES.openPalm);
    const flat = fp(SHAPES.flatHand);
    expect(open.index).toBeCloseTo(flat.index, 6);
    expect(open.gapIM).toBeGreaterThan(flat.gapIM * 1.5);
    expect(open.gapMR).toBeGreaterThan(flat.gapMR * 1.5);
    expect(open.spread).toBeGreaterThan(flat.spread * 1.5);
  });

  it('measures curl from the finger own knuckle, not only from the wrist', () => {
    const open = fp(SHAPES.openPalm);
    const fist = fp(SHAPES.fist);
    expect(open.curlIndex).toBeGreaterThan(fist.curlIndex);
    expect(open.curlMiddle).toBeGreaterThan(fist.curlMiddle);
  });

  it('tells a tucked thumb from a raised one', () => {
    expect(fp(SHAPES.thumbUpFist).thumbOut).toBeGreaterThan(fp(SHAPES.twoFingers).thumbOut);
  });

  it('keeps every feature invariant to position, distance and tilt', () => {
    const a = fp(SHAPES.iLoveYou);
    const b = poseFeatures(normalizeHand(
      buildHand(SHAPES.iLoveYou, { cx: 0.8, cy: 0.2, scale: 0.21, rotation: 64 })
    )!);
    for (const key of POSE_KEYS) expect(b[key]).toBeCloseTo(a[key], 5);
  });
});

describe('poseAgreement', () => {
  const ones = POSE_KEYS.map(() => 1);

  it('is 1 for a fingerprint against itself', () => {
    const f = poseFeatures(normalizeHand(buildHand(SHAPES.fist))!);
    expect(poseAgreement(f, f, ones).score).toBeCloseTo(1, 6);
  });

  it('does not let fifteen agreeing features hide one that is badly wrong', () => {
    const base = poseFeatures(normalizeHand(buildHand(SHAPES.openPalm))!);
    const oneOff = { ...base, spread: base.spread + 1.2 };

    // The arithmetic mean of sixteen features would barely move; the geometric
    // combination plus the worst-feature penalty has to.
    const agreement = poseAgreement(base, oneOff, ones);
    expect(agreement.score).toBeLessThan(0.55);
    expect(agreement.worst?.key).toBe('spread');
  });

  it('degrades smoothly as a hand drifts rather than falling off a cliff', () => {
    const base = poseFeatures(normalizeHand(buildHand(SHAPES.openPalm))!);
    const scores = [0.05, 0.15, 0.3].map(d =>
      poseAgreement(base, { ...base, thumb: base.thumb + d }, ones).score);
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
    expect(scores[0]).toBeGreaterThan(0.9);
  });

  it('ignores features whose weight is zero', () => {
    const a = poseFeatures(normalizeHand(buildHand(SHAPES.openPalm))!);
    const b = { ...a, palmSide: a.palmSide + 5 };
    const weights = POSE_KEYS.map(k => (k === 'palmSide' ? 0 : 1));
    expect(poseAgreement(a, b, weights).score).toBeCloseTo(1, 6);
  });
});
