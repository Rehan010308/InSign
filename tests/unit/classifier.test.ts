import { describe, expect, it } from 'vitest';
import { FeatureWindow, motionFeatures, representativePose, type WindowFrame } from '../../src/lib/sign/featureWindow';
import { LandmarkSmoother, type LandmarkFrame } from '../../src/lib/sign/kalman';
import {
  TemplateMatcherClassifier, MIN_MATCH_QUALITY, MIN_POSE_SCORE, motionScoreDetail, scoreTemplate,
} from '../../src/lib/sign/classifier';
import { TEMPLATE_BY_ID, TEMPLATES, type SignId } from '../../src/lib/sign/classifierTemplates';
import { buildHand, SHAPES, type HandShape } from '../../src/lib/sign/handModel';
import {
  FRAME_MS, SEQUENCES, moreSecondHand, restingSecondHand, tremorSequence, unknownSequence, stillSequence,
} from '../fixtures/signSequences';

const classifier = new TemplateMatcherClassifier();

/** Runs frames through the production path: Kalman → temporal window. */
function toWindow(frames: LandmarkFrame[], second?: LandmarkFrame[] | null, smooth = true): WindowFrame[] {
  const window = new FeatureWindow();
  const smoother = new LandmarkSmoother();
  const secondSmoother = new LandmarkSmoother();
  frames.forEach((f, i) => {
    const stabilized = smooth ? smoother.push(f, FRAME_MS / 1000) : f;
    const other = second
      ? (smooth ? secondSmoother.push(second[i], FRAME_MS / 1000) : second[i])
      : null;
    window.push(stabilized, i * FRAME_MS, 1, other);
  });
  return [...window.list];
}

const classify = (frames: LandmarkFrame[], second?: LandmarkFrame[] | null) =>
  classifier.classifySync(toWindow(frames, second));

/** A gesture built from an arbitrary handshape and path, as a live hand would be. */
function gesture(shape: HandShape, path: (t: number) => { cx: number; cy: number }, n = 30, scale = 0.12) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const { cx, cy } = path(t);
    return buildHand(shape, { ...path(t), cx, cy, scale, seed: i + 1 });
  });
}

const circle = (r = 0.045) => (t: number) => ({
  cx: 0.5 + r * Math.cos(t * Math.PI * 4),
  cy: 0.5 + r * Math.sin(t * Math.PI * 4),
});
const driftDown = (t: number) => ({ cx: 0.5, cy: 0.44 + 0.04 * t });
const still = () => ({ cx: 0.5, cy: 0.5 });

describe('TemplateMatcherClassifier', () => {
  const oneHanded: SignId[] = [
    'HELLO', 'THANK_YOU', 'YES', 'NO', 'HELP', 'PLEASE', 'SORRY', 'GOOD', 'I_LOVE_YOU',
  ];

  for (const id of oneHanded) {
    it(`recognises ${id} from its canonical sequence`, () => {
      const result = classify(SEQUENCES[id]());
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].sign).toBe(id);
      expect(result[0].confidence).toBeGreaterThanOrEqual(0.75);
    });
  }

  it('returns nothing at all for a movement outside the vocabulary', () => {
    expect(classify(unknownSequence())).toEqual([]);
  });

  it('returns nothing for a still hand with no sign movement', () => {
    const result = classify(stillSequence());
    for (const r of result) expect(r.confidence).toBeLessThan(0.75);
  });

  it('returns nothing when the window is too short to be a sign', () => {
    expect(classify(SEQUENCES.HELLO().slice(0, 4))).toEqual([]);
  });

  it('still recognises a sign performed with tremor', () => {
    expect(classify(tremorSequence('HELLO'))[0]?.sign).toBe('HELLO');
    expect(classify(tremorSequence('SORRY'))[0]?.sign).toBe('SORRY');
    expect(classify(tremorSequence('PLEASE'))[0]?.sign).toBe('PLEASE');
  });

  it('never returns a sign whose quality is below the floor', () => {
    const result = classify(unknownSequence());
    expect(result.every(r => r.confidence >= MIN_MATCH_QUALITY)).toBe(true);
  });

  it('returns at most the top three candidates, sorted descending', () => {
    const result = classify(SEQUENCES.HELLO());
    expect(result.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].confidence).toBeGreaterThanOrEqual(result[i].confidence);
    }
  });
});

/* ------------------------------------------------------- the reported bugs */

describe('SORRY, PLEASE and GOOD', () => {
  /**
   * All three used to fire on hands that were not making them, for the same
   * reason: pose and motion were AVERAGED, so a template could be carried by
   * whichever half happened to agree. A fist doing a circle scored 0.56 for
   * PLEASE with a hand-shape agreement of 0.01; a hand that never moved kept
   * most of GOOD's score because a flat-ish shape was close enough.
   */

  it('does not call a circle PLEASE just because the path is right', () => {
    // A fist, a perfect PLEASE circle. The shape says it is not PLEASE.
    const result = classify(gesture(SHAPES.fist, circle()));
    expect(result[0]?.sign).toBe('SORRY');
    expect(result.find(r => r.sign === 'PLEASE')?.confidence ?? 0).toBeLessThan(0.1);
  });

  it('does not call a circle SORRY when the hand is not a fist', () => {
    // A thumb-up fist is the nearest shape to a fist in the vocabulary, and it
    // used to be close enough: a thumb-up circle came out as SORRY at 0.70.
    for (const shape of [SHAPES.thumbUpFist, SHAPES.flatHand, SHAPES.openPalm]) {
      const result = classify(gesture(shape, circle()));
      expect(result.find(r => r.sign === 'SORRY')?.confidence ?? 0).toBeLessThan(0.75);
    }
  });

  it('does not call a still hand GOOD', () => {
    // The original bug in its purest form: an open palm doing nothing scored
    // 0.55 for GOOD, because "must travel downward" still scored 0.28 at zero
    // travel and a flat-ish shape covered the rest.
    const result = classify(gesture(SHAPES.openPalm, still));
    expect(result.find(r => r.sign === 'GOOD')?.confidence ?? 0).toBeLessThan(0.5);
  });

  it('does not call a slow open-palm drift GOOD', () => {
    const result = classify(gesture(SHAPES.openPalm, driftDown));
    expect(result.find(r => r.sign === 'GOOD')?.confidence ?? 0).toBeLessThan(0.75);
  });

  it('keeps THANK_YOU and GOOD apart only by how far the hand travels', () => {
    // They share a handshape and a direction, so the distance is the whole
    // difference. Each canonical sequence names itself, and the other is the
    // runner-up rather than a third sign appearing from nowhere.
    const thanks = classify(SEQUENCES.THANK_YOU());
    expect(thanks[0].sign).toBe('THANK_YOU');
    expect(thanks[1]?.sign).toBe('GOOD');

    const good = classify(SEQUENCES.GOOD());
    expect(good[0].sign).toBe('GOOD');
    expect(good[1]?.sign).toBe('THANK_YOU');
  });

  it('recognises all three when the handshape is imperfect', () => {
    const looseFist: HandShape = { thumb: 'curled', index: 'curled', middle: 'curled', ring: 'curled', pinky: 'half' };
    const loosePalm: HandShape = { thumb: 'half', index: 'extended', middle: 'extended', ring: 'extended', pinky: 'half' };
    const looseFlat: HandShape = { thumb: 'half', index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended', together: true };

    expect(classify(gesture(looseFist, circle(0.04)))[0]?.sign).toBe('SORRY');
    expect(classify(gesture(loosePalm, circle()))[0]?.sign).toBe('PLEASE');
    expect(classify(gesture(looseFlat, t => ({ cx: 0.5, cy: 0.38 + 0.075 * t })))[0]?.sign).toBe('THANK_YOU');
  });
});

describe('constraint balance', () => {
  it('does not let a perfect motion score rescue a violated hand shape', () => {
    const window = toWindow(gesture(SHAPES.fist, circle()));
    const pose = representativePose(window)!;
    const motion = motionFeatures(window);

    const please = scoreTemplate(TEMPLATE_BY_ID.get('PLEASE')!, pose, motion);
    expect(please.motionScore).toBeGreaterThan(0.9);   // the path IS a circle
    expect(please.poseScore).toBeLessThan(MIN_POSE_SCORE);
    // ...and the similarity follows the violated half, not the satisfied one.
    expect(please.similarity).toBeLessThan(0.35);
  });

  it('does not let a perfect hand shape rescue a violated motion', () => {
    const window = toWindow(gesture(SHAPES.fist, still));
    const pose = representativePose(window)!;
    const motion = motionFeatures(window);

    const sorry = scoreTemplate(TEMPLATE_BY_ID.get('SORRY')!, pose, motion);
    expect(sorry.poseScore).toBeGreaterThan(0.9);      // the shape IS a fist
    expect(sorry.motionScore).toBeLessThan(0.1);
    expect(sorry.similarity).toBeLessThan(0.35);
  });

  it('reports which constraint cost a template the most', () => {
    const window = toWindow(gesture(SHAPES.fist, still));
    const pose = representativePose(window)!;
    const sorry = scoreTemplate(TEMPLATE_BY_ID.get('SORRY')!, pose, motionFeatures(window));
    expect(sorry.weakest).toMatch(/^motion\./);
  });

  it('penalises the least-satisfied constraint rather than averaging it away', () => {
    const spec = { pathLength: { min: 1, soft: 0.5 }, oscillationX: { max: 4, soft: 2 } };
    const satisfied = motionScoreDetail(
      { pathLength: 1.5, oscillationX: 1 } as never, spec
    );
    const oneViolated = motionScoreDetail(
      { pathLength: 0, oscillationX: 1 } as never, spec
    );
    expect(satisfied.score).toBeCloseTo(1, 5);
    expect(oneViolated.score).toBe(0);
    expect(oneViolated.worst?.key).toBe('pathLength');
  });
});

describe('normalization across distance and movement', () => {
  it('reads the same sign at any distance from the camera', () => {
    for (const scale of [0.06, 0.12, 0.22]) {
      const frames = gesture(SHAPES.fist, t => {
        const k = scale / 0.12;
        return { cx: 0.5 + k * 0.04 * Math.cos(t * Math.PI * 4), cy: 0.5 + k * 0.04 * Math.sin(t * Math.PI * 4) };
      }, 30, scale);
      expect(classify(frames)[0]?.sign, `scale ${scale}`).toBe('SORRY');
    }
  });

  it('does not distort a hand that is moving towards the camera', () => {
    // The hand grows through the window; motion is measured against the median
    // apparent size, so a hand coming closer is not read as a bigger gesture.
    const frames = Array.from({ length: 30 }, (_, i) => {
      const t = i / 29;
      return buildHand(SHAPES.fist, {
        cx: 0.5 + 0.04 * Math.cos(t * Math.PI * 4),
        cy: 0.5 + 0.04 * Math.sin(t * Math.PI * 4),
        scale: 0.09 + 0.06 * t,
        seed: i + 1,
      });
    });
    expect(classify(frames)[0]?.sign).toBe('SORRY');
  });

  it('survives noisy landmarks', () => {
    let st = 3;
    const rnd = () => { st ^= st << 13; st >>>= 0; st ^= st >> 17; st ^= st << 5; st >>>= 0; return (st / 0xffffffff) * 2 - 1; };
    const noisy = SEQUENCES.SORRY().map(f => f.map(p => ({ x: p.x + rnd() * 0.012, y: p.y + rnd() * 0.012, z: p.z })));
    expect(classify(noisy)[0]?.sign).toBe('SORRY');
  });
});

describe('two-handed recognition', () => {
  it('recognises MORE only when both hands are there and moving together', () => {
    const both = classify(SEQUENCES.MORE(), moreSecondHand());
    expect(both[0]?.sign).toBe('MORE');
    expect(both[0]?.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('refuses MORE from one hand alone', () => {
    const alone = classify(SEQUENCES.MORE());
    expect(alone.find(r => r.sign === 'MORE')).toBeUndefined();
  });

  it('refuses MORE from two hands that are merely both in shot', () => {
    const resting = classify(SEQUENCES.MORE(), restingSecondHand());
    expect(resting.find(r => r.sign === 'MORE')?.confidence ?? 0).toBeLessThan(0.75);
  });

  it('leaves one-handed recognition untouched when a second hand is in view', () => {
    const withSecond = classify(SEQUENCES.SORRY(), restingSecondHand());
    const alone = classify(SEQUENCES.SORRY());
    expect(withSecond[0].sign).toBe('SORRY');
    expect(withSecond[0].confidence).toBeCloseTo(alone[0].confidence, 5);
  });

  it('declares which templates need two hands', () => {
    const twoHanded = TEMPLATES.filter(t => t.hands === 2).map(t => t.id);
    expect(twoHanded).toEqual(['MORE']);
    for (const t of TEMPLATES) {
      if (t.hands === 2) expect(t.secondPoses?.length).toBeGreaterThan(0);
    }
  });
});

describe('the vocabulary itself', () => {
  it('gives every sign at least one accepted handshape and a motion constraint', () => {
    for (const t of TEMPLATES) {
      expect(t.poses.length, t.id).toBeGreaterThan(0);
      expect(Object.keys(t.motion).length, t.id).toBeGreaterThan(0);
      expect(t.poseWeight, t.id).toBeGreaterThan(0);
      expect(t.poseWeight, t.id).toBeLessThanOrEqual(1);
    }
  });

  it('recognises each sign as itself and nothing else as it', () => {
    const oneHanded = TEMPLATES.filter(t => t.hands !== 2).map(t => t.id);
    for (const id of oneHanded) {
      const top = classify(SEQUENCES[id]())[0];
      expect(top?.sign, `${id} should recognise itself`).toBe(id);
    }
  });
});
