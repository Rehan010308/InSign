/**
 * Recorded-style landmark sequences.
 *
 * Playwright cannot make a fake webcam form a sign, and a unit test has no
 * camera at all, so both feed synthetic landmark frames through the real
 * pipeline. The frames come from the same canonical hand model the templates
 * are derived from, which means these tests prove the PIPELINE behaves — that a
 * matching shape and path score high, that an unknown one is refused — not that
 * real signers match these coordinates. Validating against real hands is the
 * job a trained model takes over.
 */
import { buildHand, SHAPES, type BuildOptions, type HandShape } from '../../src/lib/sign/handModel';
import type { LandmarkFrame } from '../../src/lib/sign/kalman';
import type { SignId } from '../../src/lib/sign/classifierTemplates';

export const FRAMES = 30;
export const FRAME_MS = 1000 / 30;

function lerpHand(a: LandmarkFrame, b: LandmarkFrame, t: number): LandmarkFrame {
  return a.map((p, i) => ({
    x: p.x + (b[i].x - p.x) * t,
    y: p.y + (b[i].y - p.y) * t,
    z: p.z + (b[i].z - p.z) * t,
  }));
}

interface PathFn {
  (t: number): { cx: number; cy: number };
}

function sequence(shape: HandShape, path: PathFn, opts: BuildOptions = {}, frames = FRAMES): LandmarkFrame[] {
  return Array.from({ length: frames }, (_, i) => {
    const t = i / (frames - 1);
    const { cx, cy } = path(t);
    return buildHand(shape, { ...opts, cx, cy, scale: opts.scale ?? 0.12, seed: i + 1 });
  });
}

const still = (cx = 0.5, cy = 0.5): PathFn => () => ({ cx, cy });

export const SEQUENCES: Record<SignId, () => LandmarkFrame[]> = {
  // open palm waving laterally: two full cycles
  HELLO: () => sequence(SHAPES.openPalm, t => ({ cx: 0.5 + 0.055 * Math.sin(t * Math.PI * 4), cy: 0.45 })),

  // flat hand travelling down the frame
  THANK_YOU: () => sequence(SHAPES.flatHand, t => ({ cx: 0.5, cy: 0.38 + 0.075 * t })),

  // fist nodding vertically
  YES: () => sequence(SHAPES.fist, t => ({ cx: 0.5, cy: 0.5 + 0.035 * Math.sin(t * Math.PI * 4) })),

  // two fingers closing onto the thumb, hand essentially still
  NO: () => {
    const open = buildHand(SHAPES.twoFingers, { cx: 0.5, cy: 0.5 });
    const closed = buildHand(SHAPES.twoFingersClosed, { cx: 0.5, cy: 0.5 });
    return Array.from({ length: FRAMES }, (_, i) =>
      lerpHand(open, closed, Math.min(1, (i / (FRAMES - 1)) * 1.4))
    );
  },

  // thumb-up fist lifting
  HELP: () => sequence(SHAPES.thumbUpFist, t => ({ cx: 0.5, cy: 0.55 - 0.05 * t })),

  // open palm circling
  PLEASE: () => sequence(SHAPES.openPalm, t => ({
    cx: 0.5 + 0.045 * Math.cos(t * Math.PI * 4),
    cy: 0.5 + 0.045 * Math.sin(t * Math.PI * 4),
  })),

  // fist circling
  SORRY: () => sequence(SHAPES.fist, t => ({
    cx: 0.5 + 0.04 * Math.cos(t * Math.PI * 4),
    cy: 0.5 + 0.04 * Math.sin(t * Math.PI * 4),
  })),

  // flat hand, short forward-and-down move
  GOOD: () => sequence(SHAPES.flatHand, t => ({ cx: 0.5, cy: 0.44 + 0.04 * t })),

  // thumb, index and little finger out, held steady with a small natural drift
  I_LOVE_YOU: () => sequence(SHAPES.iLoveYou, t => ({ cx: 0.5 + 0.004 * t, cy: 0.5 })),

  // MORE is two-handed: this is the hand the one-handed path sees. The second
  // hand comes from `secondHandFor`, and only the two-hand fixtures pair them.
  MORE: () => sequence(SHAPES.pinchedO, t => ({ cx: 0.47 + 0.012 * Math.abs(Math.sin(t * Math.PI * 2)), cy: 0.5 })),
};

/**
 * The other hand for a two-handed sign: the mirror of the primary, tapping in
 * towards it. The pair is what the two-handed template is scored against — one
 * of these alone is not the sign, and the tests check exactly that.
 */
export function moreSecondHand(): LandmarkFrame[] {
  return sequence(SHAPES.pinchedO, t => ({
    cx: 0.53 - 0.012 * Math.abs(Math.sin(t * Math.PI * 2)),
    cy: 0.5,
  }));
}

/** Two hands in shot but resting apart — near each other, going nowhere. */
export function restingSecondHand(): LandmarkFrame[] {
  return sequence(SHAPES.pinchedO, () => ({ cx: 0.68, cy: 0.5 }));
}

/** A hand doing something that is not in the vocabulary at all. */
export function unknownSequence(): LandmarkFrame[] {
  const shape: HandShape = {
    thumb: 'half', index: 'half', middle: 'curled', ring: 'half', pinky: 'extended',
  };
  return sequence(shape, t => ({ cx: 0.5 + 0.01 * Math.sin(t * 50), cy: 0.5 + 0.008 * Math.cos(t * 31) }));
}

/** The same sign, but with tremor — used to show the Kalman filter earning its place. */
export function tremorSequence(id: SignId, amplitude = 0.008): LandmarkFrame[] {
  const clean = SEQUENCES[id]();
  let state = 7;
  const rnd = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return (state / 0xffffffff) * 2 - 1;
  };
  return clean.map(frame => frame.map(p => ({
    x: p.x + rnd() * amplitude,
    y: p.y + rnd() * amplitude,
    z: p.z,
  })));
}

/** A hand held still, for the "no movement yet" case. */
export function stillSequence(shape: HandShape = SHAPES.openPalm): LandmarkFrame[] {
  return sequence(shape, still());
}
