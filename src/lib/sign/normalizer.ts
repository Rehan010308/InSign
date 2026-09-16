/**
 * Landmark normalization — makes a hand comparable to a template regardless of
 * where it is in the frame, how far from the camera it is, or how it is tilted.
 *
 *   1. translate so the wrist (landmark 0) is the origin
 *   2. scale so the wrist → middle-finger MCP distance is 1
 *   3. rotate in the image plane so that axis points "up"
 *
 * Pure and unit-tested: same input, same output, no DOM and no model.
 */
import type { Landmark, LandmarkFrame } from './kalman';

export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_MCP = 5;
export const INDEX_TIP = 8;
export const MIDDLE_MCP = 9;
export const MIDDLE_TIP = 12;
export const RING_MCP = 13;
export const RING_TIP = 16;
export const PINKY_MCP = 17;
export const PINKY_TIP = 20;

export interface NormalizedHand {
  points: LandmarkFrame;
  /** the wrist → middle-MCP distance in the source frame, i.e. apparent hand size */
  scale: number;
  /** wrist position in the source frame, kept for motion features */
  origin: Landmark;
  /** rotation applied, radians */
  rotation: number;
}

function distance2D(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * @param rotate align the wrist → middle-MCP axis to "up". On by default; the
 *        tests turn it off to check translation and scaling in isolation.
 */
export function normalizeHand(frame: LandmarkFrame, rotate = true): NormalizedHand | null {
  if (!frame || frame.length < 21) return null;

  const wrist = frame[WRIST];
  const middleMcp = frame[MIDDLE_MCP];
  const scale = distance2D(wrist, middleMcp);
  // A hand this small is either a detection artifact or far too far away to read.
  if (!Number.isFinite(scale) || scale < 1e-6) return null;

  // The reference axis, pointing from the wrist toward the middle-finger knuckle.
  const ax = (middleMcp.x - wrist.x) / scale;
  const ay = (middleMcp.y - wrist.y) / scale;
  // Image y grows downward, so "up" is -y: we want the axis to land on (0, -1).
  const rotation = rotate ? Math.atan2(ax, -ay) : 0;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);

  const points: LandmarkFrame = frame.map(p => {
    const dx = (p.x - wrist.x) / scale;
    const dy = (p.y - wrist.y) / scale;
    return {
      x: rotate ? dx * cos - dy * sin : dx,
      y: rotate ? dx * sin + dy * cos : dy,
      z: (p.z - wrist.z) / scale,
    };
  });

  return { points, scale, origin: { ...wrist }, rotation };
}

const PIP = { index: 6, middle: 10, ring: 14, pinky: 18 } as const;

/**
 * A pose fingerprint: how extended each finger is, how the fingers are spaced,
 * and where the thumb sits. All of it is derived from the normalized points, so
 * it is invariant to position, distance and tilt.
 *
 * Why there are so many features: the original five tip→wrist distances plus a
 * single spread number could not tell a flat hand from an open palm (they
 * differ only in how far the fingers are apart, which barely moves a tip→wrist
 * distance) and barely separated a fist from a thumb-up fist. With only one or
 * two features disagreeing, a weighted average over the rest diluted the
 * disagreement until the two shapes scored as near-identical — which is how a
 * hand that was not doing GOOD kept matching GOOD. The extra features are the
 * ones that actually carry those distinctions.
 */
export interface PoseFeatures {
  /** |tip - wrist| per finger, in units of the reference hand length */
  thumb: number;
  index: number;
  middle: number;
  ring: number;
  pinky: number;
  /**
   * |tip - MCP| per finger: how far the finger reaches from its own knuckle.
   * A curled finger folds back towards its knuckle, which the tip→wrist
   * distance understates because the whole finger is still out on the palm.
   */
  curlIndex: number;
  curlMiddle: number;
  curlRing: number;
  curlPinky: number;
  /** gaps between adjacent fingertips — the profile of how spread the hand is */
  gapIM: number;
  gapMR: number;
  gapRP: number;
  /** index-tip to pinky-tip distance — an open hand spreads, a fist does not */
  spread: number;
  /** thumb-tip to index-tip distance */
  pinch: number;
  /** thumb-tip to index knuckle — a tucked thumb sits on the palm, an out one does not */
  thumbOut: number;
  /** signed x of the pinky knuckle after rotation — which way the palm faces */
  palmSide: number;
}

export const POSE_KEYS: Array<keyof PoseFeatures> = [
  'thumb', 'index', 'middle', 'ring', 'pinky',
  'curlIndex', 'curlMiddle', 'curlRing', 'curlPinky',
  'gapIM', 'gapMR', 'gapRP',
  'spread', 'pinch', 'thumbOut', 'palmSide',
];

export function poseFeatures(hand: NormalizedHand): PoseFeatures {
  const p = hand.points;
  const origin = { x: 0, y: 0, z: 0 };
  return {
    thumb: distance2D(p[THUMB_TIP], origin),
    index: distance2D(p[INDEX_TIP], origin),
    middle: distance2D(p[MIDDLE_TIP], origin),
    ring: distance2D(p[RING_TIP], origin),
    pinky: distance2D(p[PINKY_TIP], origin),
    curlIndex: distance2D(p[INDEX_TIP], p[PIP.index]),
    curlMiddle: distance2D(p[MIDDLE_TIP], p[PIP.middle]),
    curlRing: distance2D(p[RING_TIP], p[PIP.ring]),
    curlPinky: distance2D(p[PINKY_TIP], p[PIP.pinky]),
    gapIM: distance2D(p[INDEX_TIP], p[MIDDLE_TIP]),
    gapMR: distance2D(p[MIDDLE_TIP], p[RING_TIP]),
    gapRP: distance2D(p[RING_TIP], p[PINKY_TIP]),
    spread: distance2D(p[INDEX_TIP], p[PINKY_TIP]),
    pinch: distance2D(p[THUMB_TIP], p[INDEX_TIP]),
    thumbOut: distance2D(p[THUMB_TIP], p[INDEX_MCP]),
    palmSide: p[PINKY_MCP].x,
  };
}

export function poseVector(f: PoseFeatures): number[] {
  return POSE_KEYS.map(k => f[k]);
}

/** Weighted Euclidean distance between two pose fingerprints. */
export function poseDistance(a: PoseFeatures, b: PoseFeatures, weights: number[]): number {
  const va = poseVector(a);
  const vb = poseVector(b);
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < va.length; i++) {
    const w = weights[i] ?? 1;
    sum += w * (va[i] - vb[i]) ** 2;
    wsum += w;
  }
  return wsum ? Math.sqrt(sum / wsum) : 0;
}

/** How much a single feature may differ before it stops agreeing, in hand-lengths. */
export const FEATURE_SIGMA = 0.3;
/**
 * How much of the pose score the worst single feature can veto. At 0.5, a hand
 * that matches everything except one thing keeps at most half its score — a
 * violated constraint is visible in the result rather than averaged away.
 */
export const WORST_FEATURE_WEIGHT = 0.5;

export interface PoseAgreement {
  /** 0–1, the combined score */
  score: number;
  /** the least-agreeing weighted feature, and how much it agreed */
  worst: { key: keyof PoseFeatures; score: number } | null;
}

/**
 * How well two fingerprints agree, combined so that no single violated feature
 * can be averaged away.
 *
 * Each feature gets its own 0–1 agreement. They are combined as a weighted
 * GEOMETRIC mean rather than an arithmetic one, so a feature that scores near
 * zero pulls the whole result towards zero instead of being outvoted by the
 * features that happen to match — and the worst feature then applies a further
 * penalty on top. This is the pose-side half of the fix for "one matching
 * feature outweighs an important violated constraint".
 */
export function poseAgreement(
  a: PoseFeatures,
  b: PoseFeatures,
  weights: number[],
  sigma = FEATURE_SIGMA
): PoseAgreement {
  let lnSum = 0;
  let wsum = 0;
  let worst: PoseAgreement['worst'] = null;
  const twoSigmaSq = 2 * sigma * sigma;

  for (let i = 0; i < POSE_KEYS.length; i++) {
    const w = weights[i] ?? 1;
    if (w <= 0) continue;
    const key = POSE_KEYS[i];
    const delta = a[key] - b[key];
    // Floored so one hopeless feature cannot take the logarithm to -Infinity
    // and wipe out a pose that is otherwise recognisable.
    const score = Math.max(1e-3, Math.exp(-(delta * delta) / twoSigmaSq));
    lnSum += w * Math.log(score);
    wsum += w;
    if (!worst || score < worst.score) worst = { key, score };
  }

  if (!wsum) return { score: 1, worst: null };
  const geometric = Math.exp(lnSum / wsum);
  const veto = worst
    ? (1 - WORST_FEATURE_WEIGHT) + WORST_FEATURE_WEIGHT * worst.score
    : 1;
  return { score: geometric * veto, worst };
}
