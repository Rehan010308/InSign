/**
 * The temporal window — a rolling ~1.2s buffer of smoothed, normalized frames
 * plus the motion descriptors a sign needs. A static pose is not a sign; the
 * classifier needs to see how the hand moved, and this is where that lives.
 */
import type { LandmarkFrame } from './kalman';
import {
  INDEX_MCP, MIDDLE_MCP, PINKY_MCP, RING_MCP, WRIST,
  normalizeHand, poseFeatures, type NormalizedHand, type PoseFeatures,
} from './normalizer';

export const WINDOW_MS = 1200;
export const MAX_FRAMES = 48;

export interface WindowFrame {
  at: number;
  pose: PoseFeatures;
  hand: NormalizedHand;
  /** palm centroid in image space */
  wx: number;
  wy: number;
  /** apparent hand size for this frame — motion is measured in hand-lengths */
  scale: number;
}

export interface MotionFeatures {
  /** total wrist path length, in hand-lengths */
  pathLength: number;
  netX: number;
  netY: number;
  amplitudeX: number;
  amplitudeY: number;
  /** direction reversals along each axis — a wave oscillates, a push does not */
  oscillationX: number;
  oscillationY: number;
  /** how much the pose itself changed across the window */
  poseChange: number;
  frames: number;
  durationMs: number;
}

/**
 * A direction change only counts once the hand has travelled this far since the
 * last turning point, in hand-lengths. Tremor reverses direction constantly but
 * never travels; without this, a shaking hand reads as a wave.
 */
export const MIN_TURN_SEGMENT = 0.18;

export class FeatureWindow {
  private frames: WindowFrame[] = [];

  clear(): void {
    this.frames = [];
  }

  get size(): number {
    return this.frames.length;
  }

  get list(): readonly WindowFrame[] {
    return this.frames;
  }

  /** @returns the window frame that was added, or null if the hand was unusable */
  push(landmarks: LandmarkFrame, at: number): WindowFrame | null {
    const hand = normalizeHand(landmarks);
    if (!hand) return null;
    // The palm centroid moves like the hand does but jitters far less than any
    // single landmark, so motion features read the palm, not the wrist point.
    const palm = [WRIST, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP];
    let px = 0, py = 0;
    for (const i of palm) { px += landmarks[i].x; py += landmarks[i].y; }
    px /= palm.length;
    py /= palm.length;

    const frame: WindowFrame = {
      at,
      hand,
      pose: poseFeatures(hand),
      wx: px,
      wy: py,
      scale: hand.scale,
    };
    this.frames.push(frame);
    const cutoff = at - WINDOW_MS;
    while (this.frames.length && (this.frames[0].at < cutoff || this.frames.length > MAX_FRAMES)) {
      this.frames.shift();
    }
    return frame;
  }

  motion(): MotionFeatures {
    return motionFeatures(this.frames);
  }
}

export function motionFeatures(frames: readonly WindowFrame[]): MotionFeatures {
  const empty: MotionFeatures = {
    pathLength: 0, netX: 0, netY: 0, amplitudeX: 0, amplitudeY: 0,
    oscillationX: 0, oscillationY: 0, poseChange: 0,
    frames: frames.length, durationMs: 0,
  };
  if (frames.length < 2) return empty;

  // Positions are in image space; distances are divided by the window's median
  // apparent hand size. Dividing each frame by its own (noisy) scale would
  // amplify detector jitter enormously, because the centroid is an absolute
  // position rather than a displacement.
  const scales = frames.map(f => f.scale).sort((a, b) => a - b);
  const refScale = scales[Math.floor(scales.length / 2)] || 1e-6;
  const nx = (f: WindowFrame) => f.wx / refScale;
  const ny = (f: WindowFrame) => f.wy / refScale;

  let pathLength = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (let i = 0; i < frames.length; i++) {
    const x = nx(frames[i]);
    const y = ny(frames[i]);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    if (i > 0) {
      pathLength += Math.hypot(x - nx(frames[i - 1]), y - ny(frames[i - 1]));
    }
  }

  const oscX = countReversals(frames.map(nx));
  const oscY = countReversals(frames.map(ny));

  const first = frames[0];
  const last = frames[frames.length - 1];
  const poseChange = Math.abs(last.pose.pinch - first.pose.pinch)
    + Math.abs(last.pose.index - first.pose.index)
    + Math.abs(last.pose.middle - first.pose.middle);

  return {
    pathLength,
    netX: nx(last) - nx(first),
    netY: ny(last) - ny(first),
    amplitudeX: maxX - minX,
    amplitudeY: maxY - minY,
    oscillationX: oscX,
    oscillationY: oscY,
    poseChange,
    frames: frames.length,
    durationMs: last.at - first.at,
  };
}

/**
 * Turning points in a 1D trajectory, ignoring wobble smaller than
 * MIN_TURN_SEGMENT. This is what separates "waving" from "trembling".
 */
export function countReversals(values: number[], minSegment = MIN_TURN_SEGMENT): number {
  if (values.length < 3) return 0;
  let reversals = 0;
  let dir = 0;
  let extreme = values[0];

  for (const v of values) {
    if (dir === 0) {
      if (v - extreme > minSegment) { dir = 1; extreme = v; }
      else if (extreme - v > minSegment) { dir = -1; extreme = v; }
    } else if (dir === 1) {
      if (v > extreme) extreme = v;
      else if (extreme - v > minSegment) { reversals++; dir = -1; extreme = v; }
    } else {
      if (v < extreme) extreme = v;
      else if (v - extreme > minSegment) { reversals++; dir = 1; extreme = v; }
    }
  }
  return reversals;
}

/**
 * The pose the window is "mostly" in: a trimmed mean over the middle of the
 * window, so the frames where the hand was still arriving or already leaving do
 * not drag the fingerprint around.
 */
export function representativePose(frames: readonly WindowFrame[]): PoseFeatures | null {
  if (!frames.length) return null;
  const start = Math.floor(frames.length * 0.2);
  const end = Math.max(start + 1, Math.ceil(frames.length * 0.85));
  const slice = frames.slice(start, end);
  const sum: PoseFeatures = {
    thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0, spread: 0, pinch: 0, palmSide: 0,
  };
  for (const f of slice) {
    sum.thumb += f.pose.thumb;
    sum.index += f.pose.index;
    sum.middle += f.pose.middle;
    sum.ring += f.pose.ring;
    sum.pinky += f.pose.pinky;
    sum.spread += f.pose.spread;
    sum.pinch += f.pose.pinch;
    sum.palmSide += f.pose.palmSide;
  }
  const n = slice.length;
  return {
    thumb: sum.thumb / n, index: sum.index / n, middle: sum.middle / n,
    ring: sum.ring / n, pinky: sum.pinky / n, spread: sum.spread / n,
    pinch: sum.pinch / n, palmSide: sum.palmSide / n,
  };
}
