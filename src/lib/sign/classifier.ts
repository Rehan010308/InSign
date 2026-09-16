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
import {
  motionFeatures, representativePose, representativeSecondPose,
  type MotionFeatures, type WindowFrame,
} from './featureWindow';
import { poseAgreement, type PoseAgreement, type PoseFeatures } from './normalizer';
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
 * A template is only a candidate if the HAND SHAPE matches well enough. Motion
 * alone must never carry a match: a loosely-specified movement plus a hand doing
 * something else is not a sign.
 *
 * Raised from 0.4 now that the fingerprint has the features to tell the shapes
 * apart — at 0.4 a thumb-up fist still qualified as a plain fist, which is how
 * a thumb-up circle came out as SORRY.
 */
export const MIN_POSE_SCORE = 0.5;
/** Fewer frames than this is not a sign, it is a glimpse. */
export const MIN_FRAMES = 10;
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

/**
 * How much of the motion score the worst single constraint can veto — the
 * motion-side twin of the pose fingerprint's worst-feature penalty.
 */
export const WORST_CONSTRAINT_WEIGHT = 0.5;

export interface MotionScore {
  score: number;
  /** the least-satisfied constraint, for the UI and for debugging templates */
  worst: { key: keyof MotionSpec; score: number } | null;
}

export function motionScoreDetail(m: MotionFeatures, spec: MotionSpec): MotionScore {
  const checks: number[] = [];
  let worst: MotionScore['worst'] = null;
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
    handGap: m.handGap,
    handGapAmplitude: m.handGapAmplitude,
  };
  for (const key of Object.keys(spec) as Array<keyof MotionSpec>) {
    const range = spec[key];
    if (!range) continue;
    const score = rangeScore(values[key], range);
    checks.push(score);
    if (!worst || score < worst.score) worst = { key, score };
  }
  if (!checks.length) return { score: 1, worst: null };

  // Geometric mean, so every constraint has to hold: a sign that travels the
  // right way but with entirely the wrong shape of path is not that sign, and
  // averaging would let one satisfied constraint carry the others. The worst
  // constraint then applies a further penalty, so a template with many loose
  // constraints cannot out-score a stricter one by having more of them agree.
  let product = 1;
  for (const c of checks) product *= c;
  const geometric = Math.pow(product, 1 / checks.length);
  const veto = worst
    ? (1 - WORST_CONSTRAINT_WEIGHT) + WORST_CONSTRAINT_WEIGHT * worst.score
    : 1;
  return { score: geometric * veto, worst };
}

export function motionScore(m: MotionFeatures, spec: MotionSpec): number {
  return motionScoreDetail(m, spec).score;
}

export interface TemplateScore {
  poseScore: number;
  motionScore: number;
  similarity: number;
  /** what agreed least — the feature or constraint that cost this template most */
  weakest: string | null;
}

/**
 * How well one template explains what the hand did.
 *
 * Pose and motion are combined MULTIPLICATIVELY (a weighted geometric mean),
 * not by averaging them. Averaging is what let a fist doing a perfect circle
 * still score 0.45 for PLEASE despite a hand shape that agreed almost not at
 * all, and let a hand that never moved keep most of GOOD's score because the
 * shape was close. Under a product, a score near zero on either side takes the
 * whole similarity with it — which is what "the sign was not performed" should
 * mean.
 */
/**
 * The best-matching handshape in a template's family.
 *
 * Best-of rather than an average: a sign accepts several handshapes, and a hand
 * that clearly is one of them should score as that one, not be dragged down by
 * how far it sits from the others.
 */
function bestVariant(pose: PoseFeatures, variants: PoseFeatures[], weights: number[]): PoseAgreement {
  let best: PoseAgreement | null = null;
  for (const variant of variants) {
    const agreement = poseAgreement(pose, variant, weights);
    if (!best || agreement.score > best.score) best = agreement;
  }
  return best ?? { score: 0, worst: null };
}

export function scoreTemplate(
  template: SignTemplate,
  pose: PoseFeatures,
  motion: MotionFeatures,
  secondPose: PoseFeatures | null = null
): TemplateScore {
  const primary = bestVariant(pose, template.poses, template.weights);
  let poseScore = primary.score;
  let weakest: string | null = primary.worst ? `pose.${primary.worst.key}` : null;
  let weakestScore = primary.worst?.score ?? 1;

  // A two-handed template has to explain BOTH hands. With no second hand in the
  // window it cannot be what happened at all.
  if (template.hands === 2) {
    if (!motion.hasSecondHand || !secondPose || !template.secondPoses?.length) {
      return { poseScore: 0, motionScore: 0, similarity: 0, weakest: 'pose.secondHand' };
    }
    const other = bestVariant(secondPose, template.secondPoses, template.weights);
    poseScore = Math.sqrt(poseScore * other.score);
    if (other.worst && other.worst.score < weakestScore) {
      weakest = `pose2.${other.worst.key}`;
      weakestScore = other.worst.score;
    }
  }

  const mo = motionScoreDetail(motion, template.motion);
  if (mo.worst && mo.worst.score < weakestScore) {
    weakest = `motion.${mo.worst.key}`;
    weakestScore = mo.worst.score;
  }

  const w = template.poseWeight;
  const similarity = Math.pow(Math.max(1e-4, poseScore), w)
    * Math.pow(Math.max(1e-4, mo.score), 1 - w);

  return { poseScore, motionScore: mo.score, similarity, weakest };
}

export function templateSimilarity(
  template: SignTemplate,
  pose: PoseFeatures,
  motion: MotionFeatures,
  secondPose: PoseFeatures | null = null
): number {
  return scoreTemplate(template, pose, motion, secondPose).similarity;
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

    const secondPose = representativeSecondPose(window);

    // Shape first: only templates whose hand shape matches get to compete.
    const scored = this.templates
      .map(t => ({ template: t, score: scoreTemplate(t, pose, motion, secondPose) }))
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
