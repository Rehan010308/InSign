/**
 * A canonical hand model.
 *
 * The template classifier needs to know what "a fist" or "an open palm" looks
 * like in landmark space. Rather than hand-typing 21 coordinates per sign, we
 * describe each shape as five finger states and generate the landmarks from one
 * idealised hand: segment lengths and spread angles taken from ordinary hand
 * proportions, joints curling toward the palm.
 *
 * This is an idealisation, not a dataset. It gives the templates a principled,
 * reproducible origin — and it is also what the tests use to generate hands, so
 * the tests prove the pipeline behaves, not that real hands match these numbers.
 * Validating against real signers is exactly the work a trained model replaces
 * this file with (docs/classifier.md).
 */
import type { LandmarkFrame } from './kalman';

export type FingerState = 'extended' | 'curled' | 'half';

export interface HandShape {
  thumb: FingerState;
  index: FingerState;
  middle: FingerState;
  ring: FingerState;
  pinky: FingerState;
  /** fingers held together (flat hand) rather than naturally spread */
  together?: boolean;
}

interface FingerSpec {
  /** landmark indices, MCP → TIP */
  joints: [number, number, number, number];
  /** direction from the wrist to the MCP, degrees clockwise from "up" */
  baseAngle: number;
  /** wrist → MCP distance, in hand-lengths */
  mcpDist: number;
  /** proximal, middle and distal segment lengths, in hand-lengths */
  segments: [number, number, number];
}

const FINGERS: Record<keyof Omit<HandShape, 'together'>, FingerSpec> = {
  thumb: { joints: [1, 2, 3, 4], baseAngle: -58, mcpDist: 0.45, segments: [0.30, 0.25, 0.22] },
  index: { joints: [5, 6, 7, 8], baseAngle: -13, mcpDist: 0.95, segments: [0.42, 0.26, 0.22] },
  middle: { joints: [9, 10, 11, 12], baseAngle: 0, mcpDist: 1.0, segments: [0.46, 0.28, 0.24] },
  ring: { joints: [13, 14, 15, 16], baseAngle: 11, mcpDist: 0.95, segments: [0.42, 0.27, 0.22] },
  pinky: { joints: [17, 18, 19, 20], baseAngle: 23, mcpDist: 0.88, segments: [0.33, 0.22, 0.20] },
};

/** How far each successive joint bends toward the palm, in degrees. */
const CURL: Record<FingerState, number> = { extended: 4, half: 42, curled: 78 };

const rad = (deg: number) => (deg * Math.PI) / 180;

export interface BuildOptions {
  /** wrist position in normalized image space */
  cx?: number;
  cy?: number;
  /** wrist → middle-MCP distance in normalized image space */
  scale?: number;
  /** rotate the whole hand, degrees */
  rotation?: number;
  /** deterministic jitter amplitude, for tremor fixtures */
  jitter?: number;
  /** seed for the jitter, so fixtures stay reproducible */
  seed?: number;
}

/**
 * Builds a 21-point hand in normalized image space (x, y ∈ 0..1, y downward),
 * the same coordinate system MediaPipe's HandLandmarker returns.
 */
export function buildHand(shape: HandShape, options: BuildOptions = {}): LandmarkFrame {
  const { cx = 0.5, cy = 0.5, scale = 0.12, rotation = 0, jitter = 0, seed = 1 } = options;

  let state = seed >>> 0 || 1;
  const rnd = () => {
    // xorshift — deterministic noise so a fixture is the same every run
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return (state / 0xffffffff) * 2 - 1;
  };

  const points: LandmarkFrame = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const spreadFactor = shape.together ? 0.42 : 1;

  const place = (index: number, ux: number, uy: number) => {
    // hand space (up = -y) → image space, with optional whole-hand rotation
    const r = rad(rotation);
    const rx = ux * Math.cos(r) - uy * Math.sin(r);
    const ry = ux * Math.sin(r) + uy * Math.cos(r);
    points[index] = {
      x: cx + rx * scale + (jitter ? rnd() * jitter : 0),
      y: cy + ry * scale + (jitter ? rnd() * jitter : 0),
      z: 0,
    };
  };

  place(0, 0, 0); // wrist

  for (const key of Object.keys(FINGERS) as Array<keyof typeof FINGERS>) {
    const spec = FINGERS[key];
    const state_ = shape[key];
    const baseAngle = spec.baseAngle * spreadFactor;
    // MCP sits on the palm, along the base direction.
    let x = Math.sin(rad(baseAngle)) * spec.mcpDist;
    let y = -Math.cos(rad(baseAngle)) * spec.mcpDist;
    place(spec.joints[0], x, y);

    let angle = baseAngle;
    for (let s = 0; s < 3; s++) {
      angle += CURL[state_];
      x += Math.sin(rad(angle)) * spec.segments[s];
      y += -Math.cos(rad(angle)) * spec.segments[s];
      place(spec.joints[s + 1], x, y);
    }
  }

  return points;
}

/* ---- the shapes the vocabulary is built from ---------------------------- */
export const SHAPES = {
  openPalm: { thumb: 'extended', index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' },
  flatHand: { thumb: 'half', index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended', together: true },
  fist: { thumb: 'curled', index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled' },
  thumbUpFist: { thumb: 'extended', index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled' },
  twoFingers: { thumb: 'half', index: 'extended', middle: 'extended', ring: 'curled', pinky: 'curled' },
  twoFingersClosed: { thumb: 'extended', index: 'half', middle: 'half', ring: 'curled', pinky: 'curled' },
} satisfies Record<string, HandShape>;
