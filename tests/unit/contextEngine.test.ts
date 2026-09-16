import { describe, expect, it } from 'vitest';
import {
  AMBIGUITY_WINDOWS, createContextState, decide, recordEmission,
} from '../../src/services/contextEngine';
import type { Classification } from '../../src/lib/sign/classifier';

const THRESHOLD = 0.75;

describe('contextEngine', () => {
  it('emits the top candidate when it clears the gate', () => {
    const state = createContextState();
    const d = decide([{ sign: 'HELLO', confidence: 0.88 }], THRESHOLD, state);
    expect(d.kind).toBe('emit');
    expect(d.sign).toBe('HELLO');
    expect(d.contextAdjusted).toBe(false);
  });

  it('ghosts a possible candidate between the floor and the gate', () => {
    const state = createContextState();
    const d = decide([{ sign: 'THANK_YOU', confidence: 0.62 }], THRESHOLD, state);
    expect(d.kind).toBe('possible');
    expect(d.message).toContain('hold the sign to confirm');
  });

  it('says the movement was unclear below the floor', () => {
    const state = createContextState();
    const d = decide([{ sign: 'NO', confidence: 0.3 }], THRESHOLD, state);
    expect(d.kind).toBe('unclear');
    expect(d.sign).toBeNull();
  });

  it('says the movement was unclear when the classifier returned nothing', () => {
    const state = createContextState();
    const d = decide([], THRESHOLD, state);
    expect(d.kind).toBe('unclear');
    expect(d.sign).toBeNull();
    expect(d.confidence).toBe(0);
  });

  it('never invents a sign that was not a candidate', () => {
    const state = createContextState();
    recordEmission(state, 'HELLO'); // HELLO → THANK_YOU is a known bigram
    const candidates: Classification[] = [
      { sign: 'YES', confidence: 0.80 },
      { sign: 'NO', confidence: 0.78 },
    ];
    for (let i = 0; i < AMBIGUITY_WINDOWS + 2; i++) {
      const d = decide(candidates, THRESHOLD, state);
      expect(['YES', 'NO']).toContain(d.sign);
      expect(d.sign).not.toBe('THANK_YOU');
    }
  });

  it('lets a prior sign break a sustained near-tie, and marks it as adjusted', () => {
    const state = createContextState();
    recordEmission(state, 'HELLO');
    const candidates: Classification[] = [
      { sign: 'YES', confidence: 0.80 },
      { sign: 'THANK_YOU', confidence: 0.76 },
    ];

    // The first windows are not enough — a single frame of doubt is not context.
    for (let i = 0; i < AMBIGUITY_WINDOWS - 1; i++) {
      expect(decide(candidates, THRESHOLD, state).sign).toBe('YES');
    }
    const adjusted = decide(candidates, THRESHOLD, state);
    expect(adjusted.sign).toBe('THANK_YOU');
    expect(adjusted.contextAdjusted).toBe(true);
    expect(adjusted.message).toContain('Context-adjusted');
  });

  it('does not use context when the candidates are clearly separated', () => {
    const state = createContextState();
    recordEmission(state, 'HELLO');
    const candidates: Classification[] = [
      { sign: 'YES', confidence: 0.92 },
      { sign: 'THANK_YOU', confidence: 0.40 },
    ];
    for (let i = 0; i < AMBIGUITY_WINDOWS + 2; i++) {
      const d = decide(candidates, THRESHOLD, state);
      expect(d.sign).toBe('YES');
      expect(d.contextAdjusted).toBe(false);
    }
  });

  it('does not use context before anything has been emitted', () => {
    const state = createContextState();
    const candidates: Classification[] = [
      { sign: 'YES', confidence: 0.80 },
      { sign: 'THANK_YOU', confidence: 0.76 },
    ];
    for (let i = 0; i < AMBIGUITY_WINDOWS + 2; i++) {
      expect(decide(candidates, THRESHOLD, state).contextAdjusted).toBe(false);
    }
  });

  it('respects a user-raised confidence gate', () => {
    const state = createContextState();
    expect(decide([{ sign: 'HELLO', confidence: 0.8 }], 0.75, state).kind).toBe('emit');
    expect(decide([{ sign: 'HELLO', confidence: 0.8 }], 0.9, createContextState()).kind).toBe('possible');
  });

  it('resets the ambiguity streak as soon as the candidates separate', () => {
    const state = createContextState();
    recordEmission(state, 'HELLO');
    const close: Classification[] = [
      { sign: 'YES', confidence: 0.80 },
      { sign: 'THANK_YOU', confidence: 0.76 },
    ];
    decide(close, THRESHOLD, state);
    decide([{ sign: 'YES', confidence: 0.9 }], THRESHOLD, state);
    expect(state.ambiguousStreak).toBe(0);
  });
});
