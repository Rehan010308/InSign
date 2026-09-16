/**
 * Context engine — deterministic, local, no language model.
 *
 * Its only job is to decide what to display given the classifier's candidates
 * and what has already been emitted. The hard rule: it can only ever choose
 * among candidates the classifier actually produced. It cannot invent a sign,
 * and when nothing clears the gate it says so.
 */
import type { Classification } from '../lib/sign/classifier';
import type { SignId } from '../lib/sign/classifierTemplates';

/** How close the top two have to be before context is allowed to break the tie. */
export const AMBIGUITY_DELTA = 0.08;
/** How many consecutive ambiguous windows before context steps in. */
export const AMBIGUITY_WINDOWS = 3;
/** Below the gate but above this, we show a ghosted "possible" hint. */
export const POSSIBLE_FLOOR = 0.55;

/** Hand-authored sequences that occur together in ordinary conversation. */
export const BIGRAMS: Partial<Record<SignId, SignId[]>> = {
  HELLO: ['THANK_YOU', 'PLEASE', 'GOOD'],
  PLEASE: ['THANK_YOU', 'HELP'],
  THANK_YOU: ['GOOD'],
  SORRY: ['THANK_YOU', 'PLEASE'],
  HELP: ['PLEASE', 'THANK_YOU'],
  YES: ['THANK_YOU', 'GOOD'],
  NO: ['SORRY', 'THANK_YOU'],
};

export type DecisionKind = 'emit' | 'possible' | 'unclear';

export interface ContextDecision {
  kind: DecisionKind;
  sign: SignId | null;
  confidence: number;
  /** true when a bigram broke a near-tie rather than raw confidence */
  contextAdjusted: boolean;
  /** UI copy for the state chip, always honest about what happened */
  message: string;
}

export interface ContextState {
  /** signs already emitted in this session, oldest first */
  emitted: SignId[];
  /** how many consecutive windows the top two have been within AMBIGUITY_DELTA */
  ambiguousStreak: number;
}

export function createContextState(): ContextState {
  return { emitted: [], ambiguousStreak: 0 };
}

/**
 * @param candidates classifier output, sorted desc (may be empty)
 * @param threshold the user's confidence gate from preferences
 */
export function decide(
  candidates: Classification[],
  threshold: number,
  state: ContextState
): ContextDecision {
  if (!candidates.length) {
    state.ambiguousStreak = 0;
    return {
      kind: 'unclear', sign: null, confidence: 0, contextAdjusted: false,
      message: 'Movement unclear — try again',
    };
  }

  const [top, second] = candidates;
  const ambiguous = !!second && top.confidence - second.confidence < AMBIGUITY_DELTA;
  state.ambiguousStreak = ambiguous ? state.ambiguousStreak + 1 : 0;

  // A sustained near-tie is the only case where prior signs get a vote, and the
  // vote can only pick between candidates that are already on the table.
  if (ambiguous && state.ambiguousStreak >= AMBIGUITY_WINDOWS && state.emitted.length) {
    const previous = state.emitted[state.emitted.length - 1];
    const likely = BIGRAMS[previous] ?? [];
    const preferred = candidates.find(c => likely.includes(c.sign));
    if (preferred && preferred.sign !== top.sign && preferred.confidence >= threshold * 0.9) {
      return {
        kind: 'emit',
        sign: preferred.sign,
        confidence: preferred.confidence,
        contextAdjusted: true,
        message: `Context-adjusted after ${previous.replace('_', ' ')}`,
      };
    }
  }

  if (top.confidence >= threshold) {
    return {
      kind: 'emit', sign: top.sign, confidence: top.confidence,
      contextAdjusted: false, message: 'Tracking',
    };
  }

  if (top.confidence >= POSSIBLE_FLOOR) {
    return {
      kind: 'possible', sign: top.sign, confidence: top.confidence, contextAdjusted: false,
      message: `Possible: ${top.sign.replace('_', ' ')}? — hold the sign to confirm`,
    };
  }

  return {
    kind: 'unclear', sign: null, confidence: top.confidence, contextAdjusted: false,
    message: 'Movement unclear — try again',
  };
}

/** Records an emission so later ties can use it. */
export function recordEmission(state: ContextState, sign: SignId): void {
  state.emitted.push(sign);
  state.ambiguousStreak = 0;
}
