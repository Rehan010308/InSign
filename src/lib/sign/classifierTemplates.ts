/**
 * The prototype vocabulary — eight signs, each a pose fingerprint plus a set of
 * motion constraints in normalized space.
 *
 * The poses are not hand-typed numbers: each one is generated from the canonical
 * hand model (handModel.ts) by naming which fingers are extended or curled, then
 * run through the same normalize → fingerprint path a live hand takes. So a
 * template is a claim about hand *shape*, stated once, in one place.
 *
 * These are templates, not a trained model. The vocabulary is small and the UI
 * says so permanently; docs/classifier.md explains how to drop a trained model
 * in behind the same interface.
 *
 * Scale reference: distances are in hand-lengths, where 1.0 is the wrist to
 * middle-finger-knuckle distance.
 */
import { normalizeHand, poseFeatures, POSE_KEYS, type PoseFeatures } from './normalizer';
import { buildHand, SHAPES, type HandShape } from './handModel';

export const SIGN_IDS = [
  'HELLO', 'THANK_YOU', 'YES', 'NO', 'HELP', 'PLEASE', 'SORRY', 'GOOD',
] as const;

export type SignId = (typeof SIGN_IDS)[number];

export const SIGN_LABELS: Record<SignId, string> = {
  HELLO: 'HELLO',
  THANK_YOU: 'THANK YOU',
  YES: 'YES',
  NO: 'NO',
  HELP: 'HELP',
  PLEASE: 'PLEASE',
  SORRY: 'SORRY',
  GOOD: 'GOOD',
};

export interface Range {
  min?: number;
  max?: number;
  /** soft margin outside the range across which the score decays to 0 */
  soft?: number;
}

export interface MotionSpec {
  oscillationX?: Range;
  oscillationY?: Range;
  netX?: Range;
  netY?: Range;
  amplitudeX?: Range;
  amplitudeY?: Range;
  pathLength?: Range;
  /** |net displacement| — small for circular motions that return home */
  netMagnitude?: Range;
  poseChange?: Range;
}

export interface SignTemplate {
  id: SignId;
  /** what the hand is doing, in one sentence — shown in the UI's vocabulary list */
  description: string;
  shape: HandShape;
  pose: PoseFeatures;
  /** per-feature weights, in POSE_KEYS order */
  weights: number[];
  motion: MotionSpec;
  /** how much of the score comes from the pose rather than the movement */
  poseWeight: number;
}

/** The fingerprint of a shape, as the live pipeline would compute it. */
export function shapeFingerprint(shape: HandShape): PoseFeatures {
  const hand = normalizeHand(buildHand(shape));
  if (!hand) throw new Error('canonical hand failed to normalize');
  return poseFeatures(hand);
}

/* weights in POSE_KEYS order: thumb, index, middle, ring, pinky, spread, pinch, palmSide.
   palmSide is deliberately unweighted everywhere: it flips with handedness, and
   guessing at it would invent precision the pipeline does not have. */
const W_OPEN = [0.8, 1.2, 1.2, 1.1, 1.0, 1.1, 0.7, 0];
const W_FIST = [0.9, 1.3, 1.3, 1.2, 1.0, 1.0, 0.8, 0];
const W_THUMB = [1.6, 1.2, 1.2, 1.0, 0.9, 0.9, 1.0, 0];
const W_TWO = [0.7, 1.3, 1.3, 1.4, 1.3, 1.0, 0.7, 0];
const W_FLAT = [0.9, 1.2, 1.2, 1.1, 1.0, 1.4, 1.3, 0];

for (const w of [W_OPEN, W_FIST, W_THUMB, W_TWO, W_FLAT]) {
  if (w.length !== POSE_KEYS.length) throw new Error('template weights must line up with POSE_KEYS');
}

export const TEMPLATES: SignTemplate[] = [
  {
    id: 'HELLO',
    description: 'Open palm, waving side to side.',
    shape: SHAPES.openPalm,
    pose: shapeFingerprint(SHAPES.openPalm),
    weights: W_OPEN,
    poseWeight: 0.5,
    motion: {
      oscillationX: { min: 2, soft: 1 },
      // A wave travels sideways; a circle does not, and must not read as HELLO.
      oscillationY: { max: 1, soft: 1 },
      amplitudeX: { min: 0.45, soft: 0.3 },
      pathLength: { min: 1.0, soft: 0.6 },
    },
  },
  {
    id: 'THANK_YOU',
    description: 'Flat hand starting near the chin, moving forward and down.',
    shape: SHAPES.flatHand,
    pose: shapeFingerprint(SHAPES.flatHand),
    weights: W_FLAT,
    poseWeight: 0.55,
    motion: {
      netY: { min: 0.3, soft: 0.25 },
      oscillationX: { max: 1, soft: 1 },
      pathLength: { min: 0.4, max: 2.6, soft: 0.6 },
    },
  },
  {
    id: 'YES',
    description: 'Fist nodding up and down.',
    shape: SHAPES.fist,
    pose: shapeFingerprint(SHAPES.fist),
    weights: W_FIST,
    poseWeight: 0.5,
    motion: {
      oscillationY: { min: 2, soft: 1 },
      amplitudeY: { min: 0.22, soft: 0.18 },
      // A nod is vertical; lateral travel means this is some other sign.
      oscillationX: { max: 2, soft: 1.5 },
      amplitudeX: { max: 0.25, soft: 0.25 },
    },
  },
  {
    id: 'NO',
    description: 'Index and middle finger closing down onto the thumb.',
    shape: SHAPES.twoFingers,
    pose: shapeFingerprint(SHAPES.twoFingers),
    weights: W_TWO,
    poseWeight: 0.65,
    motion: {
      poseChange: { min: 0.22, soft: 0.2 },
      pathLength: { max: 1.6, soft: 0.8 },
    },
  },
  {
    id: 'HELP',
    description: 'Fist with the thumb up, lifting slightly.',
    shape: SHAPES.thumbUpFist,
    pose: shapeFingerprint(SHAPES.thumbUpFist),
    weights: W_THUMB,
    poseWeight: 0.65,
    motion: {
      netY: { max: -0.15, soft: 0.25 },
      oscillationY: { max: 2, soft: 1.5 },
    },
  },
  {
    id: 'PLEASE',
    description: 'Flat palm moving in a circle.',
    shape: SHAPES.openPalm,
    pose: shapeFingerprint(SHAPES.openPalm),
    weights: W_OPEN,
    poseWeight: 0.45,
    motion: {
      oscillationX: { min: 2, soft: 1 },
      oscillationY: { min: 2, soft: 1 },
      pathLength: { min: 1.4, soft: 0.8 },
      netMagnitude: { max: 0.5, soft: 0.4 },
    },
  },
  {
    id: 'SORRY',
    description: 'Fist moving in a circle over the chest.',
    shape: SHAPES.fist,
    pose: shapeFingerprint(SHAPES.fist),
    weights: W_FIST,
    poseWeight: 0.45,
    motion: {
      oscillationX: { min: 2, soft: 1 },
      oscillationY: { min: 2, soft: 1 },
      pathLength: { min: 1.2, soft: 0.8 },
      netMagnitude: { max: 0.5, soft: 0.4 },
    },
  },
  {
    id: 'GOOD',
    description: 'Flat hand from the chin moving forward, fingers together.',
    shape: SHAPES.flatHand,
    pose: shapeFingerprint(SHAPES.flatHand),
    weights: W_FLAT,
    poseWeight: 0.6,
    motion: {
      netY: { min: 0.18, max: 0.45, soft: 0.2 },
      oscillationX: { max: 1, soft: 1 },
      pathLength: { min: 0.3, max: 1.4, soft: 0.5 },
    },
  },
];

export const TEMPLATE_BY_ID = new Map(TEMPLATES.map(t => [t.id, t]));

/**
 * THANK_YOU and GOOD share a hand shape and a downward path; a hand-only
 * pipeline has no face to anchor them to, so they routinely land within the
 * context engine's ambiguity window and neither is emitted. That is the honest
 * outcome and it is stated in the UI rather than resolved by guessing.
 */
export const KNOWN_AMBIGUITIES: Array<[SignId, SignId]> = [['THANK_YOU', 'GOOD']];
