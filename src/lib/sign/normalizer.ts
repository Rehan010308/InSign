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

/**
 * A pose fingerprint: how extended each finger is, how spread the hand is, and
 * where the thumb sits. All of it is derived from the normalized points, so it
 * is invariant to position, distance and tilt.
 */
export interface PoseFeatures {
  /** |tip - wrist| per finger, in units of the reference hand length */
  thumb: number;
  index: number;
  middle: number;
  ring: number;
  pinky: number;
  /** index-tip to pinky-tip distance — an open hand spreads, a fist does not */
  spread: number;
  /** thumb-tip to index-tip distance */
  pinch: number;
  /** signed x of the pinky knuckle after rotation — which way the palm faces */
  palmSide: number;
}

export const POSE_KEYS: Array<keyof PoseFeatures> = [
  'thumb', 'index', 'middle', 'ring', 'pinky', 'spread', 'pinch', 'palmSide',
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
    spread: distance2D(p[INDEX_TIP], p[PINKY_TIP]),
    pinch: distance2D(p[THUMB_TIP], p[INDEX_TIP]),
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
