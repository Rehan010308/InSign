/**
 * The sign classifier.
 *
 * The interface is the point: everything upstream (camera, landmarks, Kalman,
 * temporal window) and downstream (confidence gate, context engine, UI) talks to
 * `SignClassifier`, so swapping the template matcher for a trained model is a
 * one-file change. See docs/classifier.md.
 *
 * The honest part: `TemplateMatcherClassifier` first asks "does this look like
 * ANY sign I know?" (absolute match quality) and only then "which one?"
 * (relative share). A hand doing something unknown produces low quality and the
 * classifier returns nothing at all — it never redistributes a softmax over
 * eight options and calls the argmax a detection.
 */
import { motionFeatures, representativePose, type MotionFeatures, type WindowFrame } from './featureWindow';
import { poseDistance } from './normalizer';
import { TEMPLATES, type MotionSpec, type Range, type SignId, type SignTemplate } from './classifierTemplates';

export interface Classification {
  sign: SignId;
  confidence: number;
}

export interface SignClassifier {
  classify(window: readonly WindowFrame[]): Promise<Classification[]>;
  readonly name: string;
}

/* ---------------------------------------------------------------- tuneables */
/** Below this, nothing in the vocabulary is a plausible match. */
export const MIN_MATCH_QUALITY = 0.45;
/**
 * A template is only a candidate if the HAND SHAPE matches. Motion alone must
 * never carry a match: a loosely-specified movement plus a hand doing something
 * else is not a sign, and blending the two scores would let it look like one.
 */
export const MIN_POSE_SCORE = 0.4;
/** Fewer frames than this is not a sign, it is a glimpse. */
export const MIN_FRAMES = 10;
/** Pose-distance falloff: how far a hand may drift before the pose stops matching. */
export const POSE_SIGMA = 0.34;
/** Softmax temperature over template similarities. */
export const SOFTMAX_T = 0.06;
export const TOP_K = 3;

/** 1 inside the range, decaying to 0 across `soft` outside it. */
export function rangeScore(value: number, range: Range): number {
  const soft = range.soft ?? 0.25;
  let score = 1;
  if (range.min !== undefined && value < range.min) {
    score = Math.min(score, Math.max(0, 1 - (range.min - value) / soft));
  }
  if (range.max !== undefined && value > range.max) {
    score = Math.min(score, Math.max(0, 1 - (value - range.max) / soft));
  }
  return score;
}

export function motionScore(m: MotionFeatures, spec: MotionSpec): number {
  const checks: number[] = [];
  const netMagnitude = Math.hypot(m.netX, m.netY);
  const values: Record<keyof MotionSpec, number> = {
    oscillationX: m.oscillationX,
    oscillationY: m.oscillationY,
    netX: m.netX,
    netY: m.netY,
    amplitudeX: m.amplitudeX,
    amplitudeY: m.amplitudeY,
    pathLength: m.pathLength,
    netMagnitude,
    poseChange: m.poseChange,
  };
  for (const key of Object.keys(spec) as Array<keyof MotionSpec>) {
    const range = spec[key];
    if (!range) continue;
    checks.push(rangeScore(values[key], range));
  }
  if (!checks.length) return 1;
  // Geometric mean, so every constraint has to hold: a sign that travels the
  // right way but with entirely the wrong shape of path is not that sign, and
  // averaging would let one satisfied constraint carry the others.
  let product = 1;
  for (const c of checks) product *= c;
  return Math.pow(product, 1 / checks.length);
}

export interface TemplateScore {
  poseScore: number;
  motionScore: number;
  similarity: number;
}

export function scoreTemplate(
  template: SignTemplate,
  pose: Parameters<typeof poseDistance>[0],
  motion: MotionFeatures
): TemplateScore {
  const d = poseDistance(pose, template.pose, template.weights);
  const poseScore = Math.exp(-(d * d) / (2 * POSE_SIGMA * POSE_SIGMA));
  const moScore = motionScore(motion, template.motion);
  return {
    poseScore,
    motionScore: moScore,
    similarity: template.poseWeight * poseScore + (1 - template.poseWeight) * moScore,
  };
}

export function templateSimilarity(
  template: SignTemplate,
  pose: Parameters<typeof poseDistance>[0],
  motion: MotionFeatures
): number {
  return scoreTemplate(template, pose, motion).similarity;
}

export function softmax(values: number[], temperature = SOFTMAX_T): number[] {
  if (!values.length) return [];
  const max = Math.max(...values);
  const exps = values.map(v => Math.exp((v - max) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map(e => e / sum);
}

export class TemplateMatcherClassifier implements SignClassifier {
  readonly name = 'template-matcher-v1';

  constructor(private templates: SignTemplate[] = TEMPLATES) {}

  /** Synchronous core, exposed for unit tests; `classify` just wraps it. */
  classifySync(window: readonly WindowFrame[]): Classification[] {
    if (window.length < MIN_FRAMES) return [];
    const pose = representativePose(window);
    if (!pose) return [];
    const motion = motionFeatures(window);

    // Shape first: only templates whose hand shape matches get to compete.
    const scored = this.templates
      .map(t => ({ template: t, score: scoreTemplate(t, pose, motion) }))
      .filter(s => s.score.poseScore >= MIN_POSE_SCORE);
    if (!scored.length) return [];

    const sims = scored.map(s => s.score.similarity);
    const quality = Math.max(...sims);

    // Nothing in the vocabulary is close enough — say nothing.
    if (quality < MIN_MATCH_QUALITY) return [];

    const probs = softmax(sims);
    return scored
      .map(({ template: t }, i) => ({
        sign: t.id,
        // Absolute plausibility × relative share: a hand that half-matches two
        // templates cannot produce a confident label for either.
        confidence: Math.min(0.98, Math.round(quality * probs[i] * 1000) / 1000),
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, TOP_K);
  }

  async classify(window: readonly WindowFrame[]): Promise<Classification[]> {
    return this.classifySync(window);
  }
}

export const defaultClassifier: SignClassifier = new TemplateMatcherClassifier();
