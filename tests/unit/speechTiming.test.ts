/**
 * Timing regression tests for the pace metric.
 *
 * The bug these exist for: "the time spoken" used to be derived by subtracting
 * the gaps between recognition results from the session. Those gaps include the
 * time each phrase was itself being spoken, so the remainder collapsed towards
 * zero and a normal sentence could be reported at tens of thousands of words a
 * minute.
 *
 * Pace is now words over the session's own wall clock — one measurement taken
 * from Start to Stop that no recognition restart can touch — so there is no
 * subtraction left to collapse. The utterance spans are still measured, but
 * only to tell silence between phrases from speech, never to divide into words.
 */
import { describe, expect, it } from 'vitest';
import {
  activeSpeechFromSpans, computeMetrics, pausesFromSpans, speechSpans, wordsPerMinute,
  MIN_MEASURABLE_MS, type SpeechEvent,
} from '../../src/lib/speech/metrics';
import { DEFAULT_FILLER_WORDS } from '../../src/types';

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const metrics = (transcript: string, events: SpeechEvent[], durationMs: number) =>
  computeMetrics(transcript, events, durationMs, DEFAULT_FILLER_WORDS);

describe('wordsPerMinute', () => {
  it('is words over the session duration, exactly', () => {
    expect(wordsPerMinute(words(10), 30_000)).toBe(20);
    expect(wordsPerMinute(words(100), 60_000)).toBe(100);
    expect(wordsPerMinute(words(90), 45_000)).toBe(120);
  });

  it('is null for a zero duration rather than infinite', () => {
    expect(wordsPerMinute(words(18), 0)).toBeNull();
  });

  it('is null for a near-zero duration — the 54,000 WPM case', () => {
    // 18 words in 20ms is what the old subtraction produced. It is not a pace.
    expect(wordsPerMinute(words(18), 20)).toBeNull();
    expect(wordsPerMinute(words(18), MIN_MEASURABLE_MS - 1)).toBeNull();
  });

  it('reports a pace from the first measurable duration up, with no clamp', () => {
    expect(wordsPerMinute(words(18), MIN_MEASURABLE_MS)).toBe(720);
    // A genuinely fast burst is reported as measured, not capped.
    expect(wordsPerMinute(words(60), 10_000)).toBe(360);
  });

  it('reports zero words as zero, not as missing data', () => {
    expect(wordsPerMinute('', 30_000)).toBe(0);
  });

  it('is unchanged by a long session', () => {
    expect(wordsPerMinute(words(1500), 600_000)).toBe(150);
  });
});

describe('speechSpans', () => {
  it('measures each utterance from where it started being heard', () => {
    const events: SpeechEvent[] = [
      { at: 3_000, startedAt: 1_000 },
      { at: 9_000, startedAt: 6_500 },
    ];
    expect(speechSpans(events)).toEqual([
      { start: 1_000, end: 3_000 },
      { start: 6_500, end: 9_000 },
    ]);
    expect(activeSpeechFromSpans(speechSpans(events), 12_000)).toBe(4_500);
  });

  it('excludes microphone and service startup latency', () => {
    // 2.5s of startup before the first word, then 4s of speech.
    const spans = speechSpans([{ at: 6_500, startedAt: 2_500 }]);
    expect(spans[0].start).toBe(2_500);
    expect(activeSpeechFromSpans(spans, 7_000)).toBe(4_000);
  });

  it('never lets a span run backwards or overlap the previous one', () => {
    const spans = speechSpans([
      { at: 5_000, startedAt: 1_000 },
      { at: 8_000, startedAt: 2_000 },   // claims to start inside the previous span
      { at: 9_000, startedAt: 12_000 },  // claims to start after it ended
    ]);
    expect(spans).toEqual([
      { start: 1_000, end: 5_000 },
      { start: 5_000, end: 8_000 },
      { start: 9_000, end: 9_000 },
    ]);
    for (const s of spans) expect(s.end).toBeGreaterThanOrEqual(s.start);
  });

  it('drops a late or duplicated final that lands before time already counted', () => {
    const spans = speechSpans([
      { at: 8_000, startedAt: 5_000 },
      { at: 7_000, startedAt: 6_000 }, // arrived out of order after Stop
    ]);
    expect(spans).toEqual([{ start: 5_000, end: 8_000 }]);
  });

  it('caps measured speech at the session it happened in', () => {
    const spans = speechSpans([{ at: 31_000, startedAt: 1_000 }]);
    expect(activeSpeechFromSpans(spans, 29_000)).toBe(29_000);
  });
});

describe('pause detection', () => {
  const span = (start: number, end: number, afterRestart = false) =>
    afterRestart ? { start, end, afterRestart: true } : { start, end };

  it('ignores a gap shorter than the threshold', () => {
    expect(pausesFromSpans([span(0, 1_000), span(1_700, 3_000)], 800).count).toBe(0);
  });

  it('does not count a gap of exactly the threshold', () => {
    // The rule is "longer than 800ms", so 800 itself is still speech rhythm.
    expect(pausesFromSpans([span(0, 1_000), span(1_800, 3_000)], 800).count).toBe(0);
  });

  it('counts a gap longer than the threshold', () => {
    const r = pausesFromSpans([span(0, 1_000), span(1_801, 3_000)], 800);
    expect(r.count).toBe(1);
    expect(r.at).toEqual([1_000]);
  });

  it('counts several pauses and where each one started', () => {
    const r = pausesFromSpans(
      [span(0, 2_000), span(5_000, 7_000), span(7_500, 9_000), span(14_000, 16_000)],
      800
    );
    expect(r.count).toBe(2);
    expect(r.at).toEqual([2_000, 9_000]);
    expect(r.totalPausedMs).toBe(3_000 + 5_000);
  });

  it('never counts the silence before the first phrase or after the last', () => {
    // 6 seconds of microphone startup, one phrase, then 9 seconds before Stop.
    const m = metrics(words(20), [{ at: 12_000, startedAt: 6_000 }], 21_000);
    expect(m.pauseCount).toBe(0);
  });

  it('does not count a recognition restart gap as a pause', () => {
    // The API dropped out at ~9.5s and came back at ~16s. That six seconds is
    // the service reconnecting, not the speaker deciding what to say next.
    const m = metrics(words(30), [
      { at: 9_500, startedAt: 1_000 },
      { at: 25_000, startedAt: 16_000, afterRestart: true },
    ], 26_000);
    expect(m.pauseCount).toBe(0);
    expect(m.activeSpeechMs).toBe(17_500);
  });

  it('still counts a real pause that follows a restart', () => {
    const m = metrics(words(40), [
      { at: 9_500, startedAt: 1_000 },
      { at: 20_000, startedAt: 16_000, afterRestart: true }, // reconnection gap
      { at: 30_000, startedAt: 26_000 },                     // a real 6s silence
    ], 31_000);
    expect(m.pauseCount).toBe(1);
  });

  it('survives several restarts without inventing pauses', () => {
    const m = metrics(words(45), [
      { at: 8_000, startedAt: 1_000 },
      { at: 20_000, startedAt: 14_000, afterRestart: true },
      { at: 34_000, startedAt: 28_000, afterRestart: true },
    ], 36_000);
    expect(m.pauseCount).toBe(0);
    expect(m.wordsPerMinute).toBe(75);
  });

  it('counts a long silence in the middle of an answer', () => {
    const m = metrics(words(20), [
      { at: 6_000, startedAt: 1_000 },
      { at: 35_000, startedAt: 30_000 },  // 24s of silence before this one
      { at: 45_000, startedAt: 40_000 },  // 5s of silence before this one
    ], 46_000);
    expect(m.pauseCount).toBe(2);
  });
});

describe('the session as a whole', () => {
  it('Stop immediately after a final result cannot produce an absurd pace', () => {
    // The old code divided by (duration − gaps) ≈ the sliver between the last
    // final result and Stop: 18 words / 20ms = 54,000 WPM.
    const m = metrics(words(18), [
      { at: 5_000, startedAt: 1_000 },
      { at: 29_980, startedAt: 25_000 },
    ], 30_000);
    expect(m.wordsPerMinute).toBe(36);
    expect(m.wordsPerMinute!).toBeLessThan(400);
  });

  it('counts a final result that arrived during Stop', () => {
    // The hook waits for the API to settle before metrics are computed, so the
    // last sentence is part of the session even though it landed after Stop.
    const m = metrics(words(40), [
      { at: 20_000, startedAt: 2_000 },
      { at: 31_200, startedAt: 22_000 }, // finalised 1.2s after Stop
    ], 30_000);
    expect(m.words).toBe(40);
    expect(m.wordsPerMinute).toBe(80);
    // Speaking time is still clipped to the session that contained it.
    expect(m.activeSpeechMs).toBe(27_200);
  });

  it('reports no pace at all for a session too short to measure', () => {
    const m = metrics('hello there', [{ at: 900, startedAt: 600 }], 1_200);
    expect(m.wordsPerMinute).toBeNull();
    expect(m.words).toBe(2);
  });

  it('keeps filler and repetition detection untouched by the timing change', () => {
    const m = metrics('um I I think um we should go', [
      { at: 4_000, startedAt: 1_000 },
      { at: 12_000, startedAt: 8_000 },
    ], 13_000);
    expect(m.fillerCount).toBe(2);
    expect(m.repetitionCount).toBe(1);
    expect(m.pauseCount).toBe(1);
  });
});
