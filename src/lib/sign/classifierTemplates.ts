/**
 * The prototype vocabulary — each sign is a pose fingerprint plus a set of
 * motion constraints in normalized space, and for the two-handed sign a
 * constraint on how the hands relate to each other.
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
import type { LandmarkFrame } from './kalman';

export const SIGN_IDS = [
  'HELLO', 'THANK_YOU', 'YES', 'NO', 'HELP', 'PLEASE', 'SORRY', 'GOOD',
  'I_LOVE_YOU', 'MORE',
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
  I_LOVE_YOU: 'I LOVE YOU',
  MORE: 'MORE',
};

export interface Range {
  min?: number;
  max?: number;
  /**
   * Soft margin outside the range across which the score decays to 0.
   *
   * This is not decoration: a margin wider than the constraint itself means a
   * hand that does not move at all still scores half way on "must travel
   * downward", which is how a still hand used to read as GOOD. Keep a defining
   * constraint's margin well under its own magnitude.
   */
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
  /** distance between the two palms, in hand-lengths (two-handed signs only) */
  handGap?: Range;
  /** how much that distance varied across the window (two-handed signs only) */
  handGapAmplitude?: Range;
}

export interface SignTemplate {
  id: SignId;
  /** what the hand is doing, in one sentence — shown in the UI's vocabulary list */
  description: string;
  shape: HandShape;
  /**
   * The handshapes this sign accepts, scored best-of.
   *
   * A sign is a *family* of handshapes, not one set of coordinates: real
   * signers rest the little finger, half-extend the thumb, and pass through
   * intermediate shapes on the way. Modelling that as several accepted
   * fingerprints keeps the discriminative features strict — a fist is still not
   * an open palm — instead of buying tolerance by loosening every threshold,
   * which would let the confusions back in.
   */
  poses: PoseFeatures[];
  /** per-feature weights, in POSE_KEYS order */
  weights: number[];
  motion: MotionSpec;
  /** how much of the score comes from the pose rather than the movement */
  poseWeight: number;
  /**
   * How many hands the sign needs. A two-handed template is only considered
   * when a second hand is actually in the window, and its `motion` carries the
   * `handGap` constraints that make it a two-handed sign rather than two
   * unrelated hands in the same frame.
   */
  hands?: 1 | 2;
  /** the shapes the second hand must also be in, for two-handed signs */
  secondShape?: HandShape;
  secondPoses?: PoseFeatures[];
}

/** The fingerprint of a shape, as the live pipeline would compute it. */
export function shapeFingerprint(shape: HandShape): PoseFeatures {
  const hand = normalizeHand(buildHand(shape));
  if (!hand) throw new Error('canonical hand failed to normalize');
  return poseFeatures(hand);
}

/**
 * The fingerprint of a hand caught part-way between two shapes.
 *
 * A sign like NO is a handshape *changing*, so the window's representative pose
 * is the middle of the movement and matches neither end of it. Blending the
 * landmarks before normalizing — rather than averaging two fingerprints — is
 * what the pipeline would actually see.
 */
export function blendFingerprint(a: HandShape, b: HandShape, t: number): PoseFeatures {
  const from = buildHand(a);
  const to = buildHand(b);
  const mixed: LandmarkFrame = from.map((p, i) => ({
    x: p.x + (to[i].x - p.x) * t,
    y: p.y + (to[i].y - p.y) * t,
    z: p.z + (to[i].z - p.z) * t,
  }));
  const hand = normalizeHand(mixed);
  if (!hand) throw new Error('blended hand failed to normalize');
  return poseFeatures(hand);
}

/** A shape with one finger relaxed — the most common way a real hand differs. */
function variants(base: HandShape, ...tweaks: Array<Partial<HandShape>>): PoseFeatures[] {
  return [base, ...tweaks.map(t => ({ ...base, ...t }))].map(shapeFingerprint);
}

/* ---------------------------------------------------------------- weights */

/**
 * Weights by feature name rather than by array position.
 *
 * With sixteen features, a positional array was a transcription error waiting
 * to happen, and it hid which distinction each template actually relies on.
 * `palmSide` defaults to zero everywhere: it flips with handedness, and
 * guessing at it would invent precision the pipeline does not have.
 */
export function weightsFor(spec: Partial<Record<keyof PoseFeatures, number>>): number[] {
  const out = POSE_KEYS.map(k => spec[k] ?? 1);
  const palmIndex = POSE_KEYS.indexOf('palmSide');
  if (spec.palmSide === undefined) out[palmIndex] = 0;
  if (out.length !== POSE_KEYS.length) throw new Error('template weights must line up with POSE_KEYS');
  return out;
}

/** An open hand: the fingers are out AND apart. The gaps are what separate it
 *  from a flat hand, which is the confusion that made GOOD fire at open palms. */
const W_OPEN = weightsFor({
  index: 1.2, middle: 1.2, ring: 1.1,
  curlIndex: 1.3, curlMiddle: 1.3, curlRing: 1.2, curlPinky: 1.1,
  gapIM: 1.4, gapMR: 1.4, gapRP: 1.3, spread: 1.4,
  thumb: 0.8, pinch: 0.7, thumbOut: 0.8,
});

/** A flat hand: fingers out but held TOGETHER, thumb tucked alongside. */
const W_FLAT = weightsFor({
  index: 1.1, middle: 1.1,
  curlIndex: 1.2, curlMiddle: 1.2, curlRing: 1.1, curlPinky: 1.0,
  gapIM: 1.6, gapMR: 1.6, gapRP: 1.5, spread: 1.6,
  thumb: 1.0, pinch: 0.9, thumbOut: 1.0,
});

/** A fist: every finger folded, thumb across the palm rather than up. */
const W_FIST = weightsFor({
  index: 1.2, middle: 1.2, ring: 1.1, pinky: 1.0,
  curlIndex: 1.4, curlMiddle: 1.4, curlRing: 1.3, curlPinky: 1.2,
  thumb: 1.2, thumbOut: 1.5, pinch: 0.9,
  gapIM: 0.8, gapMR: 0.8, gapRP: 0.8, spread: 0.8,
});

/** A thumb-up fist: the same folded fingers, but the thumb is the whole point. */
const W_THUMB = weightsFor({
  thumb: 2.0, thumbOut: 2.0, pinch: 1.2,
  curlIndex: 1.3, curlMiddle: 1.3, curlRing: 1.2, curlPinky: 1.1,
  index: 1.1, middle: 1.1,
  gapIM: 0.8, gapMR: 0.8, gapRP: 0.8, spread: 0.8,
});

/** Index and middle out, ring and pinky folded. */
const W_TWO = weightsFor({
  index: 1.3, middle: 1.3, ring: 1.4, pinky: 1.3,
  curlIndex: 1.3, curlMiddle: 1.3, curlRing: 1.5, curlPinky: 1.4,
  gapMR: 1.3, spread: 1.0, thumb: 0.7, pinch: 0.7, thumbOut: 0.8,
});

/** Thumb, index and pinky out with the middle two folded — a shape nothing
 *  else in the vocabulary comes close to, which is why it can be added safely. */
const W_ILY = weightsFor({
  thumb: 1.4, index: 1.4, pinky: 1.4,
  middle: 1.5, ring: 1.5,
  curlIndex: 1.3, curlMiddle: 1.6, curlRing: 1.6, curlPinky: 1.3,
  gapIM: 1.2, gapMR: 1.0, gapRP: 1.2, spread: 1.0,
  thumbOut: 1.2, pinch: 0.8,
});

/** Fingers gathered towards the thumb — the shape both hands make for MORE. */
const W_PINCH = weightsFor({
  curlIndex: 1.2, curlMiddle: 1.2, curlRing: 1.1, curlPinky: 1.0,
  pinch: 1.6, thumbOut: 1.2, thumb: 1.2,
  gapIM: 1.2, gapMR: 1.2, gapRP: 1.1, spread: 1.2,
});

export const TEMPLATES: SignTemplate[] = [
  {
    id: 'HELLO',
    description: 'Open palm, waving side to side.',
    shape: SHAPES.openPalm,
    // A wave is done with a relaxed hand: the thumb often stays half out and
    // the little finger rarely reaches full extension.
    poses: variants(SHAPES.openPalm, { thumb: 'half' }, { pinky: 'half' }, { thumb: 'half', pinky: 'half' }),
    weights: W_OPEN,
    poseWeight: 0.5,
    motion: {
      // Soft margins are wide enough that a slower or smaller wave degrades
      // gradually; a sign that is merely unhurried should lose confidence, not
      // score exactly zero and disappear.
      oscillationX: { min: 2, soft: 1.5 },
      // A wave travels sideways; a circle does not, and must not read as HELLO.
      oscillationY: { max: 1, soft: 1.5 },
      amplitudeX: { min: 0.45, soft: 0.3 },
      // A wave is far wider than it is tall — this is what keeps a loose,
      // bobbing wave from reading as the PLEASE circle and vice versa.
      amplitudeY: { max: 0.5, soft: 0.35 },
      pathLength: { min: 1.0, soft: 0.5 },
    },
  },
  {
    id: 'THANK_YOU',
    description: 'Flat hand starting near the chin, moving forward and down.',
    shape: SHAPES.flatHand,
    poses: variants(SHAPES.flatHand, { thumb: 'extended' }, { thumb: 'curled' }),
    weights: W_FLAT,
    poseWeight: 0.55,
    motion: {
      netY: { min: 0.3, soft: 0.16 },
      oscillationX: { max: 1, soft: 1.5 },
      pathLength: { min: 0.4, max: 2.6, soft: 0.25 },
    },
  },
  {
    id: 'YES',
    description: 'Fist nodding up and down.',
    shape: SHAPES.fist,
    poses: variants(SHAPES.fist, { thumb: 'half' }, { pinky: 'half' }),
    weights: W_FIST,
    poseWeight: 0.5,
    motion: {
      oscillationY: { min: 2, soft: 1.5 },
      amplitudeY: { min: 0.22, soft: 0.14 },
      // A nod is vertical; lateral travel means this is some other sign. Real
      // nods drift sideways a little, so the margin is generous rather than
      // absent — but it still has to be mostly vertical.
      oscillationX: { max: 2, soft: 1.5 },
      amplitudeX: { max: 0.3, soft: 0.25 },
    },
  },
  {
    id: 'NO',
    description: 'Index and middle finger closing down onto the thumb.',
    shape: SHAPES.twoFingers,
    // NO is a handshape closing, so the window's representative pose is the
    // middle of that movement: both ends and the middle are accepted.
    poses: [
      shapeFingerprint(SHAPES.twoFingers),
      blendFingerprint(SHAPES.twoFingers, SHAPES.twoFingersClosed, 0.5),
      shapeFingerprint(SHAPES.twoFingersClosed),
    ],
    weights: W_TWO,
    poseWeight: 0.65,
    motion: {
      poseChange: { min: 0.22, soft: 0.12 },
      pathLength: { max: 1.6, soft: 0.5 },
    },
  },
  {
    id: 'HELP',
    description: 'Fist with the thumb up, lifting slightly.',
    shape: SHAPES.thumbUpFist,
    poses: variants(SHAPES.thumbUpFist, { pinky: 'half' }, { index: 'half' }),
    weights: W_THUMB,
    poseWeight: 0.65,
    motion: {
      netY: { max: -0.15, soft: 0.1 },
      oscillationY: { max: 2, soft: 1.5 },
      // A lift is a lift, not a circle or a wave.
      amplitudeX: { max: 0.45, soft: 0.3 },
    },
  },
  {
    id: 'PLEASE',
    description: 'Flat palm moving in a circle.',
    shape: SHAPES.openPalm,
    poses: variants(SHAPES.openPalm, { thumb: 'half' }, { pinky: 'half' }, { thumb: 'half', pinky: 'half' }),
    weights: W_OPEN,
    poseWeight: 0.5,
    motion: {
      oscillationX: { min: 2, soft: 1.5 },
      oscillationY: { min: 2, soft: 1.5 },
      // A circle is round: it has to travel on BOTH axes. Without these, a nod
      // or a wave that wobbles on the other axis satisfied every remaining
      // constraint, and the circle signs quietly swallowed the linear ones.
      amplitudeX: { min: 0.3, soft: 0.18 },
      amplitudeY: { min: 0.3, soft: 0.18 },
      pathLength: { min: 1.4, soft: 0.6 },
      netMagnitude: { max: 0.5, soft: 0.3 },
    },
  },
  {
    id: 'SORRY',
    description: 'Fist moving in a circle over the chest.',
    shape: SHAPES.fist,
    poses: variants(SHAPES.fist, { thumb: 'half' }, { pinky: 'half' }),
    weights: W_FIST,
    poseWeight: 0.5,
    motion: {
      oscillationX: { min: 2, soft: 1.5 },
      oscillationY: { min: 2, soft: 1.5 },
      // Same as PLEASE: the circle must actually be a circle, or a nodding
      // fist (YES) reads as SORRY, whose looser spec would otherwise win.
      amplitudeX: { min: 0.3, soft: 0.18 },
      amplitudeY: { min: 0.3, soft: 0.18 },
      pathLength: { min: 1.2, soft: 0.5 },
      netMagnitude: { max: 0.5, soft: 0.3 },
    },
  },
  {
    id: 'GOOD',
    description: 'Flat hand from the chin moving forward, fingers together.',
    shape: SHAPES.flatHand,
    poses: variants(SHAPES.flatHand, { thumb: 'extended' }, { thumb: 'curled' }),
    weights: W_FLAT,
    poseWeight: 0.6,
    motion: {
      netY: { min: 0.18, max: 0.45, soft: 0.1 },
      oscillationX: { max: 1, soft: 1.5 },
      // The margin here used to be twice the minimum, so a hand that never
      // moved still scored half on "must travel" — and a still open palm came
      // out as GOOD. It is now a fraction of the requirement.
      pathLength: { min: 0.3, max: 1.4, soft: 0.15 },
    },
  },
  {
    id: 'I_LOVE_YOU',
    description: 'Thumb, index and little finger extended, middle two folded, held steady.',
    shape: SHAPES.iLoveYou,
    poses: variants(SHAPES.iLoveYou, { ring: 'half' }, { middle: 'half' }, { thumb: 'half' }),
    weights: W_ILY,
    // The shape is unmistakable and the sign is a held handshape rather than a
    // path, so nearly all of the evidence is the pose.
    poseWeight: 0.85,
    motion: {
      pathLength: { max: 1.0, soft: 0.4 },
      poseChange: { max: 0.25, soft: 0.15 },
    },
  },
  {
    id: 'MORE',
    description: 'Both hands gathered to a point, tapping fingertips together.',
    shape: SHAPES.pinchedO,
    poses: variants(SHAPES.pinchedO, { thumb: 'extended' }, { pinky: 'curled' }),
    weights: W_PINCH,
    poseWeight: 0.55,
    hands: 2,
    secondShape: SHAPES.pinchedO,
    secondPoses: variants(SHAPES.pinchedO, { thumb: 'extended' }, { pinky: 'curled' }),
    motion: {
      // What makes this two-handed rather than two hands that happen to be in
      // shot: they have to be near each other AND moving relative to each
      // other. Two resting hands satisfy neither.
      handGap: { max: 1.8, soft: 0.6 },
      handGapAmplitude: { min: 0.25, soft: 0.15 },
      pathLength: { max: 2.4, soft: 0.8 },
    },
  },
];

export const TEMPLATE_BY_ID = new Map(TEMPLATES.map(t => [t.id, t]));

export const TWO_HANDED: SignId[] = TEMPLATES.filter(t => t.hands === 2).map(t => t.id);

/**
 * THANK_YOU and GOOD share a hand shape and a downward path; a hand-only
 * pipeline has no face to anchor them to, so they routinely land within the
 * context engine's ambiguity window and neither is emitted. That is the honest
 * outcome and it is stated in the UI rather than resolved by guessing.
 */
export const KNOWN_AMBIGUITIES: Array<[SignId, SignId]> = [['THANK_YOU', 'GOOD']];
