/**
 * The temporal window — a rolling ~1.2s buffer of smoothed, normalized frames
 * plus the motion descriptors a sign needs. A static pose is not a sign; the
 * classifier needs to see how the hand moved, and this is where that lives.
 */
import type { LandmarkFrame } from './kalman';
import {
  INDEX_MCP, MIDDLE_MCP, PINKY_MCP, POSE_KEYS, RING_MCP, WRIST,
  normalizeHand, poseFeatures, type NormalizedHand, type PoseFeatures,
} from './normalizer';

export const WINDOW_MS = 1200;
export const MAX_FRAMES = 48;

export interface HandSample {
  pose: PoseFeatures;
  hand: NormalizedHand;
  /** palm centroid in image space */
  wx: number;
  wy: number;
  /** apparent hand size for this frame — motion is measured in hand-lengths */
  scale: number;
}

export interface WindowFrame extends HandSample {
  at: number;
  /**
   * The other hand, when one is in view. One-handed templates ignore it
   * entirely, so adding it cannot change how they score; the two-handed
   * template is the only thing that reads it.
   */
  second?: HandSample;
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
  /** true when a second hand was in view for most of the window */
  hasSecondHand: boolean;
  /** median distance between the two palms, in hand-lengths (0 with one hand) */
  handGap: number;
  /** how much that distance varied across the window — a tap moves it, resting hands do not */
  handGapAmplitude: number;
  frames: number;
  durationMs: number;
}

/**
 * A direction change only counts once the hand has travelled this far since the
 * last turning point, in hand-lengths. Tremor reverses direction constantly but
 * never travels; without this, a shaking hand reads as a wave.
 */
export const MIN_TURN_SEGMENT = 0.18;

/**
 * Undoes MediaPipe's per-axis normalization.
 *
 * `x` comes back divided by the frame width and `y` by the frame height, so on
 * a 16:9 camera a hand is horizontally squashed to ~56% of its true proportions
 * in landmark space. Every shape feature — finger spread above all — is wrong by
 * that factor, and no amount of translating, scaling or rotating a squashed hand
 * turns it back into a square-space one. Multiplying x by the aspect ratio does,
 * and it is done once, here, rather than being baked into each template.
 */
export function toSquareSpace(frame: LandmarkFrame, aspect: number): LandmarkFrame {
  if (!Number.isFinite(aspect) || aspect === 1 || aspect <= 0) return frame;
  return frame.map(p => ({ x: p.x * aspect, y: p.y, z: p.z * aspect }));
}

/**
 * One hand, converted to the square space the rest of the geometry lives in and
 * reduced to a fingerprint plus a palm position. Returns null for a hand that is
 * incomplete or too small to read, which is the only place that check belongs.
 */
export function toSample(landmarks: LandmarkFrame | null | undefined, aspect = 1): HandSample | null {
  if (!landmarks || landmarks.length < 21) return null;
  const square = toSquareSpace(landmarks, aspect);
  const hand = normalizeHand(square);
  if (!hand) return null;
  // The palm centroid moves like the hand does but jitters far less than any
  // single landmark, so motion features read the palm, not the wrist point.
  const palm = [WRIST, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP];
  let px = 0, py = 0;
  for (const i of palm) { px += square[i].x; py += square[i].y; }
  px /= palm.length;
  py /= palm.length;
  return { hand, pose: poseFeatures(hand), wx: px, wy: py, scale: hand.scale };
}

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

  /**
   * @param aspect video width / height. Landmarks arrive normalized per axis,
   *        so they are converted to a square space here — the single boundary
   *        where the pipeline's geometry starts. Everything downstream (pose
   *        fingerprints, motion, the templates) then shares one convention.
   * @returns the window frame that was added, or null if the hand was unusable
   */
  push(landmarks: LandmarkFrame, at: number, aspect = 1, second?: LandmarkFrame | null): WindowFrame | null {
    const sample = toSample(landmarks, aspect);
    if (!sample) return null;

    const frame: WindowFrame = { at, ...sample };
    const other = second ? toSample(second, aspect) : null;
    if (other) frame.second = other;
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
    hasSecondHand: false, handGap: 0, handGapAmplitude: 0,
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

  // Two-hand relation. Measured only over the frames where BOTH hands were
  // actually seen, and reported as "no second hand" unless that was most of the
  // window — a hand that wandered through shot for three frames is not half of
  // a two-handed sign.
  const paired = frames.filter(f => f.second);
  const gaps = paired.map(f => Math.hypot(f.wx - f.second!.wx, f.wy - f.second!.wy) / refScale);
  const hasSecondHand = gaps.length >= Math.ceil(frames.length * 0.6) && gaps.length >= 2;
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const handGap = hasSecondHand ? sortedGaps[Math.floor(sortedGaps.length / 2)] : 0;
  const handGapAmplitude = hasSecondHand
    ? sortedGaps[sortedGaps.length - 1] - sortedGaps[0]
    : 0;

  return {
    pathLength,
    netX: nx(last) - nx(first),
    netY: ny(last) - ny(first),
    amplitudeX: maxX - minX,
    amplitudeY: maxY - minY,
    oscillationX: oscX,
    oscillationY: oscY,
    poseChange,
    hasSecondHand,
    handGap,
    handGapAmplitude,
    frames: frames.length,
    durationMs: last.at - first.at,
  };
}

/**
 * The second hand's pose across the window, for the two-handed template. Null
 * whenever there was no steady second hand to describe.
 */
export function representativeSecondPose(frames: readonly WindowFrame[]): PoseFeatures | null {
  const paired = frames.filter(f => f.second);
  if (paired.length < 2) return null;
  const asPrimary = paired.map(f => ({ ...f, ...f.second! }));
  return representativePose(asPrimary);
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
  // Averaged over POSE_KEYS rather than field by field, so a feature added to
  // the fingerprint cannot be silently left out of the representative pose.
  const out = {} as PoseFeatures;
  for (const key of POSE_KEYS) {
    let sum = 0;
    for (const f of slice) sum += f.pose[key];
    out[key] = sum / slice.length;
  }
  return out;
}
