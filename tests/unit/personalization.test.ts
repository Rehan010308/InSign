import { describe, expect, it } from 'vitest';
import {
  INSUFFICIENT_HISTORY, MIN_SESSIONS_PER_SCENARIO, RECENCY_WINDOW_DAYS,
  detectPattern, estimateWords, evidenceConfidence, median, weeklyActivity,
} from '../../src/services/personalizationEngine';
import type { Scenario, SpeechSession } from '../../src/types';

const NOW = Date.parse('2026-03-01T12:00:00.000Z');
const day = 86_400_000;

let n = 0;
function session(
  scenario: Scenario,
  daysAgo: number,
  metrics: Partial<Pick<SpeechSession, 'words_per_minute' | 'pause_count' | 'repetition_count' | 'filler_count' | 'duration_ms'>> = {}
): SpeechSession {
  n += 1;
  return {
    id: `s${n}`,
    user_id: 'u1',
    scenario,
    transcript: null,
    duration_ms: metrics.duration_ms ?? 120_000,
    words_per_minute: metrics.words_per_minute ?? 120,
    pause_count: metrics.pause_count ?? 4,
    repetition_count: metrics.repetition_count ?? 1,
    filler_count: metrics.filler_count ?? 2,
    created_at: new Date(NOW - daysAgo * day).toISOString(),
  };
}

describe('median', () => {
  it('handles odd and even counts and empty input', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('estimateWords', () => {
  it('derives the word count from the metrics, so a redacted transcript still counts', () => {
    expect(estimateWords(session('interview', 1, { words_per_minute: 120, duration_ms: 60_000 }))).toBe(120);
  });
});

describe('evidenceConfidence', () => {
  it('stays inside 0.5–0.9 and grows with evidence', () => {
    const small = evidenceConfidence(3, 0);
    const large = evidenceConfidence(8, 1);
    expect(small).toBeGreaterThanOrEqual(0.5);
    expect(large).toBeLessThanOrEqual(0.9);
    expect(large).toBeGreaterThan(small);
  });

  it('never reports false precision', () => {
    const c = evidenceConfidence(5, 0.37);
    expect(c).toBe(Math.round(c * 100) / 100);
  });
});

describe('detectPattern', () => {
  it('refuses to claim anything without history', () => {
    expect(detectPattern([], NOW)).toEqual(INSUFFICIENT_HISTORY);
  });

  it(`refuses below ${MIN_SESSIONS_PER_SCENARIO} sessions in one scenario`, () => {
    const sessions = [
      session('interview', 1),
      session('interview', 2),
      session('presentation', 3),
    ];
    const result = detectPattern(sessions, NOW);
    expect(result.pattern).toBeNull();
    expect(result.recommendation).toBe(INSUFFICIENT_HISTORY.recommendation);
  });

  it(`ignores sessions older than ${RECENCY_WINDOW_DAYS} days`, () => {
    const sessions = [
      session('interview', 30, { pause_count: 20 }),
      session('interview', 31, { pause_count: 20 }),
      session('interview', 32, { pause_count: 20 }),
    ];
    expect(detectPattern(sessions, NOW)).toEqual(INSUFFICIENT_HISTORY);
  });

  it('detects longer pauses in one scenario and cites the real numbers', () => {
    const sessions = [
      session('interview', 1, { pause_count: 14 }),
      session('interview', 3, { pause_count: 13 }),
      session('interview', 6, { pause_count: 15 }),
      session('conversation', 2, { pause_count: 3 }),
      session('conversation', 4, { pause_count: 4 }),
    ];
    const result = detectPattern(sessions, NOW);
    expect(result.pattern).toBe('longer_pauses');
    expect(result.scenario).toBe('interview');
    expect(result.recommendation).toContain('interview');
    expect(result.recommendation).toMatch(/\d+ pauses/);
    expect(result.rationale).toContain('last 3 interview sessions');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.confidence).toBeLessThanOrEqual(0.9);
  });

  it('detects a slowing pace across same-scenario sessions', () => {
    const sessions = [
      session('presentation', 9, { words_per_minute: 140, pause_count: 4 }),
      session('presentation', 6, { words_per_minute: 138, pause_count: 4 }),
      session('presentation', 3, { words_per_minute: 112, pause_count: 4 }),
      session('presentation', 1, { words_per_minute: 108, pause_count: 4 }),
    ];
    const result = detectPattern(sessions, NOW);
    expect(result.pattern).toBe('slowing_pace');
    expect(result.evidence.decline_pct).toBeGreaterThanOrEqual(10);
  });

  it('detects repetitions that concentrate in one scenario', () => {
    const sessions = [
      session('interview', 1, { repetition_count: 12 }),
      session('interview', 2, { repetition_count: 11 }),
      session('interview', 4, { repetition_count: 13 }),
      session('conversation', 3, { repetition_count: 1 }),
      session('conversation', 5, { repetition_count: 1 }),
      session('conversation', 6, { repetition_count: 0 }),
    ];
    const result = detectPattern(sessions, NOW);
    expect(result.pattern).toBe('frequent_repetitions');
    expect(result.scenario).toBe('interview');
  });

  it('detects filler-heavy practice in one scenario', () => {
    const sessions = [
      session('phone_call', 1, { filler_count: 18 }),
      session('phone_call', 2, { filler_count: 20 }),
      session('phone_call', 5, { filler_count: 19 }),
      session('conversation', 3, { filler_count: 2 }),
      session('conversation', 4, { filler_count: 1 }),
      session('conversation', 6, { filler_count: 2 }),
    ];
    const result = detectPattern(sessions, NOW);
    expect(result.pattern).toBe('filler_heavy');
    expect(result.scenario).toBe('phone_call');
  });

  it('says so honestly when sessions are consistent and nothing stands out', () => {
    const sessions = [
      session('interview', 1),
      session('interview', 2),
      session('interview', 3),
    ];
    const result = detectPattern(sessions, NOW);
    expect(result.pattern).toBeNull();
    expect(result.recommendation).toContain('No single pattern stands out yet');
  });

  it('is deterministic — the same sessions always give the same answer', () => {
    const sessions = [
      session('interview', 1, { pause_count: 14 }),
      session('interview', 3, { pause_count: 13 }),
      session('interview', 6, { pause_count: 15 }),
      session('conversation', 2, { pause_count: 3 }),
    ];
    const a = detectPattern(sessions, NOW);
    const b = detectPattern([...sessions].reverse(), NOW);
    expect(b).toEqual(a);
  });
});

describe('weeklyActivity', () => {
  it('buckets sessions into the last six weeks, oldest first', () => {
    const sessions = [
      session('interview', 1),
      session('interview', 2),
      session('interview', 9),
      session('interview', 60),
    ];
    const weeks = weeklyActivity(sessions, 6, NOW);
    expect(weeks).toHaveLength(6);
    expect(weeks[5]).toBe(2);
    expect(weeks[4]).toBe(1);
    expect(weeks.reduce((a, b) => a + b, 0)).toBe(3); // the 60-day-old one falls outside the six weeks
  });
});
