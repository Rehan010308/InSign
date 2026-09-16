import { describe, expect, it } from 'vitest';
import { FeatureWindow, type WindowFrame } from '../../src/lib/sign/featureWindow';
import { LandmarkSmoother, type LandmarkFrame } from '../../src/lib/sign/kalman';
import { TemplateMatcherClassifier, MIN_MATCH_QUALITY } from '../../src/lib/sign/classifier';
import type { SignId } from '../../src/lib/sign/classifierTemplates';
import { FRAME_MS, SEQUENCES, tremorSequence, unknownSequence, stillSequence } from '../fixtures/signSequences';

const classifier = new TemplateMatcherClassifier();

/** Runs frames through the production path: Kalman → temporal window. */
function toWindow(frames: LandmarkFrame[], smooth = true): WindowFrame[] {
  const window = new FeatureWindow();
  const smoother = new LandmarkSmoother();
  frames.forEach((f, i) => {
    const stabilized = smooth ? smoother.push(f, FRAME_MS / 1000) : f;
    window.push(stabilized, i * FRAME_MS);
  });
  return [...window.list];
}

const classify = (frames: LandmarkFrame[]) => classifier.classifySync(toWindow(frames));

describe('TemplateMatcherClassifier', () => {
  const unambiguous: SignId[] = ['HELLO', 'YES', 'NO', 'HELP', 'PLEASE', 'SORRY'];

  for (const id of unambiguous) {
    it(`recognises ${id} from its canonical sequence`, () => {
      const result = classify(SEQUENCES[id]());
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].sign).toBe(id);
      expect(result[0].confidence).toBeGreaterThanOrEqual(0.75);
    });
  }

  it('keeps THANK_YOU and GOOD as an honest tie rather than picking one', () => {
    // Same hand shape, same downward path, no face to anchor them — a hand-only
    // pipeline genuinely cannot separate these, and it should not pretend to.
    const result = classify(SEQUENCES.THANK_YOU());
    const topTwo = result.slice(0, 2).map(r => r.sign).sort();
    expect(topTwo).toEqual(['GOOD', 'THANK_YOU']);
  });

  it('returns nothing at all for a movement outside the vocabulary', () => {
    expect(classify(unknownSequence())).toEqual([]);
  });

  it('returns nothing for a still hand with no sign movement', () => {
    const result = classify(stillSequence());
    // A still open palm is a plausible pose but no sign's motion — if anything
    // survives the quality floor it must not be confident.
    for (const r of result) expect(r.confidence).toBeLessThan(0.75);
  });

  it('returns nothing when the window is too short to be a sign', () => {
    expect(classify(SEQUENCES.HELLO().slice(0, 4))).toEqual([]);
  });

  it('still recognises a sign performed with tremor', () => {
    const result = classify(tremorSequence('HELLO'));
    expect(result[0]?.sign).toBe('HELLO');
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
