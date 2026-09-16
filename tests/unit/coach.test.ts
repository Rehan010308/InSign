/**
 * The practice coach is the part of the Speech Companion that claims to know
 * something about the user, so these tests are mostly about what it refuses to
 * claim: no pattern before there is history, no target that is not a number,
 * and nothing about a scenario the user has not practised.
 */
import { describe, expect, it } from 'vitest';
import {
  COMFORTABLE_PACE, MIN_SESSIONS_FOR_PATTERN, compareToTargets, countTarget, drillFor,
  focusFor, generateTargets, meetsTarget, numbersFromSession, observations, paceTarget,
  recommendationSentence, scenarioProfile, targetStreak,
  type SessionNumbers,
} from '../../src/lib/speech/coach';
import type { Scenario, SpeechSession } from '../../src/types';

const NOW = Date.parse('2026-04-01T10:00:00.000Z');
const day = 86_400_000;
let seq = 0;

function session(
  scenario: Scenario,
  daysAgo: number,
  m: { wpm?: number; pauses?: number; fillers?: number; reps?: number; ms?: number } = {}
): SpeechSession {
  seq += 1;
  return {
    id: `s${seq}`,
    user_id: 'u1',
    scenario,
    transcript: null,
    duration_ms: m.ms ?? 60_000,
    words_per_minute: m.wpm ?? 120,
    pause_count: m.pauses ?? 4,
    repetition_count: m.reps ?? 1,
    filler_count: m.fillers ?? 2,
    created_at: new Date(NOW - daysAgo * day).toISOString(),
  };
}

const numbers = (m: Partial<SessionNumbers> = {}): SessionNumbers => ({
  wpm: 120, pauses: 4, fillers: 2, repetitions: 1, durationMs: 60_000, words: 120, ...m,
});

/* --------------------------------------------------------------- baseline */

describe('baseline mode', () => {
  it('claims no pattern below three sessions in the scenario', () => {
    for (const count of [0, 1, 2]) {
      const history = Array.from({ length: count }, (_, i) => session('interview', i + 1));
      const p = scenarioProfile(history, 'interview');
      expect(p.baseline, `${count} sessions`).toBe(true);
      expect(p.focus).toBeNull();
      for (const trend of Object.values(p.trends)) expect(trend).toBe('building');
    }
  });

  it('switches to a real pattern at three sessions', () => {
    const history = [
      session('interview', 1, { fillers: 9 }),
      session('interview', 3, { fillers: 8 }),
      session('interview', 5, { fillers: 10 }),
    ];
    const p = scenarioProfile(history, 'interview');
    expect(p.baseline).toBe(false);
    expect(p.count).toBe(MIN_SESSIONS_FOR_PATTERN);
    expect(p.focus).toBe('fillers');
  });

  it('says so in the recommendation instead of guessing', () => {
    const p = scenarioProfile([session('interview', 1)], 'interview');
    const text = recommendationSentence(p, [], null, 'interview');
    expect(text).toContain('Building your interview baseline');
  });
});

/* ------------------------------------------------------ scenario-specific */

describe('scenario-specific history', () => {
  const history = [
    session('interview', 1, { fillers: 9, pauses: 3 }),
    session('interview', 2, { fillers: 8, pauses: 3 }),
    session('interview', 3, { fillers: 10, pauses: 4 }),
    session('conversation', 1, { fillers: 1, pauses: 12 }),
    session('conversation', 2, { fillers: 1, pauses: 11 }),
    session('conversation', 3, { fillers: 0, pauses: 13 }),
  ];

  it('never mixes one scenario into another', () => {
    const interview = scenarioProfile(history, 'interview');
    const conversation = scenarioProfile(history, 'conversation');

    expect(interview.count).toBe(3);
    expect(conversation.count).toBe(3);
    expect(interview.focus).toBe('fillers');
    expect(conversation.focus).toBe('pauses');
    expect(interview.medians.fillers).toBe(9);
    expect(conversation.medians.fillers).toBe(1);
  });

  it('is empty for a scenario the user has never practised', () => {
    const p = scenarioProfile(history, 'presentation');
    expect(p.count).toBe(0);
    expect(p.latest).toBeNull();
    expect(p.baseline).toBe(true);
  });
});

describe('trends', () => {
  it('calls a falling count improving', () => {
    const p = scenarioProfile([
      session('interview', 1, { fillers: 3 }),
      session('interview', 4, { fillers: 6 }),
      session('interview', 8, { fillers: 9 }),
    ], 'interview');
    expect(p.trends.fillers).toBe('improving');
  });

  it('calls a rising count a recurring focus', () => {
    const p = scenarioProfile([
      session('interview', 1, { pauses: 12 }),
      session('interview', 4, { pauses: 8 }),
      session('interview', 8, { pauses: 5 }),
    ], 'interview');
    expect(p.trends.pauses).toBe('recurring');
  });

  it('reads a pace moving towards the comfortable band as improving', () => {
    const p = scenarioProfile([
      session('interview', 1, { wpm: 112 }),
      session('interview', 4, { wpm: 100 }),
      session('interview', 8, { wpm: 88 }),
    ], 'interview');
    expect(p.trends.pace).toBe('improving');
  });
});

/* ---------------------------------------------------------------- targets */

describe('targets', () => {
  it('steps a slow pace towards the band rather than all the way to it', () => {
    const t = paceTarget(92);
    expect(t.display).toBe('100–115 WPM');
    expect(t.min).toBe(100);
    expect(t.max).toBe(115);
  });

  it('steps a fast pace back down', () => {
    const t = paceTarget(190);
    expect(t.min).toBeGreaterThanOrEqual(COMFORTABLE_PACE.min);
    expect(t.max).toBeLessThan(190);
  });

  it('asks a speaker already in the band to stay in it', () => {
    expect(paceTarget(130).display).toBe(`${COMFORTABLE_PACE.min}–${COMFORTABLE_PACE.max} WPM`);
  });

  it('sets a count target below what actually happened, never above', () => {
    expect(countTarget('fillers', 8).display).toBe('≤ 5');
    expect(countTarget('fillers', 4).display).toBe('≤ 3');
    expect(countTarget('pauses', 7).display).toBe('≤ 5');
    expect(countTarget('repetitions', 1).display).toBe('≤ 0');
    expect(countTarget('fillers', 0).max).toBe(0);
  });

  it('produces between one and three measurable targets, focus included', () => {
    const t = generateTargets(numbers({ wpm: 92, pauses: 7, fillers: 8, repetitions: 0 }), 'fillers');
    expect(t.length).toBeGreaterThanOrEqual(1);
    expect(t.length).toBeLessThanOrEqual(3);
    expect(t.map(x => x.metric)).toContain('fillers');
    // Every target is a number, never a phrase like "speak more clearly".
    for (const x of t) expect(x.display).toMatch(/\d/);
  });

  it('still gives a clean session something to hold on to', () => {
    const t = generateTargets(numbers({ wpm: 130, pauses: 2, fillers: 0, repetitions: 0 }), null);
    expect(t.length).toBe(1);
  });

  it('judges a result against its target', () => {
    const target = countTarget('fillers', 8);   // ≤ 5
    expect(meetsTarget(numbers({ fillers: 4 }), target)).toBe('reached');
    expect(meetsTarget(numbers({ fillers: 5 }), target)).toBe('reached');
    expect(meetsTarget(numbers({ fillers: 6 }), target)).toBe('almost');
    expect(meetsTarget(numbers({ fillers: 9 }), target)).toBe('keep');
  });

  it('cannot judge a pace that was never measurable', () => {
    expect(meetsTarget(numbers({ wpm: null }), paceTarget(92))).toBe('keep');
  });
});

/* ------------------------------------------------------------ comparison */

describe('target comparison after Practice Again', () => {
  const before = numbers({ wpm: 92, pauses: 7, fillers: 8 });
  const targets = generateTargets(before, 'fillers');

  it('shows before → after against each target', () => {
    const after = numbers({ wpm: 108, pauses: 4, fillers: 5 });
    const rows = compareToTargets(before, after, targets);

    const pace = rows.find(r => r.metric === 'pace')!;
    expect(pace.from).toBe(92);
    expect(pace.to).toBe(108);
    expect(pace.status).toBe('reached');

    const pauses = rows.find(r => r.metric === 'pauses')!;
    expect(pauses.status).toBe('reached');
    expect(pauses.improved).toBe(true);

    const fillers = rows.find(r => r.metric === 'fillers')!;
    expect(fillers.target.display).toBe('≤ 5');
    expect(fillers.status).toBe('reached');
  });

  it('says "almost" when the number moved but did not arrive', () => {
    const rows = compareToTargets(before, numbers({ wpm: 92, pauses: 7, fillers: 6 }), targets);
    expect(rows.find(r => r.metric === 'fillers')!.status).toBe('almost');
  });

  it('says to keep practising without calling it a failure', () => {
    const rows = compareToTargets(before, numbers({ wpm: 60, pauses: 12, fillers: 11 }), targets);
    for (const r of rows) expect(r.status).toBe('keep');
  });
});

/* ---------------------------------------------------------------- drills */

describe('drills', () => {
  const profileOf = (history: SpeechSession[]) => scenarioProfile(history, 'interview');

  it('matches the drill to the weakness', () => {
    const p = profileOf([
      session('interview', 1, { fillers: 6 }),
      session('interview', 3, { fillers: 9 }),
      session('interview', 5, { fillers: 8 }),
    ]);
    const drill = drillFor('fillers', p);
    expect(drill.focus).toBe('fillers');
    expect(drill.title).toBe('FILLER CONTROL');
    expect(drill.instruction.toLowerCase()).toContain('silent pause');

    expect(drillFor('pauses', p).title).toBe('PAUSE CONTROL');
    expect(drillFor('pace', p).title).toBe('PACE CONTROL');
    expect(drillFor('repetitions', p).title).toBe('REPETITION CONTROL');
  });

  it('starts short and lengthens as targets are actually reached', () => {
    // Each session halves the previous filler count, so every attempt beats the
    // target the one before it implied.
    const improving = [
      session('interview', 1, { fillers: 1 }),
      session('interview', 2, { fillers: 3 }),
      session('interview', 3, { fillers: 6 }),
      session('interview', 4, { fillers: 12 }),
      session('interview', 5, { fillers: 24 }),
    ];
    const streak = targetStreak(improving, 'fillers');
    expect(streak.hits).toBeGreaterThanOrEqual(4);
    expect(drillFor('fillers', profileOf(improving)).level).toBe(3);
  });

  it('holds the target and simplifies the drill when attempts keep missing', () => {
    const stuck = [
      session('interview', 1, { fillers: 10 }),
      session('interview', 2, { fillers: 10 }),
      session('interview', 3, { fillers: 10 }),
    ];
    const streak = targetStreak(stuck, 'fillers');
    expect(streak.misses).toBeGreaterThanOrEqual(2);

    const drill = drillFor('fillers', profileOf(stuck));
    expect(drill.level).toBe(1);
    // The target itself is untouched — only the drill got easier.
    expect(countTarget('fillers', 10).display).toBe('≤ 7');
    expect(drill.instruction).toContain('two sentences');
  });

  it('never asks for longer than the question is meant to take', () => {
    const drill = drillFor('pauses', profileOf([]), 30);
    expect(drill.durationSec).toBeLessThanOrEqual(30);
  });
});

/* ----------------------------------------------------------- observations */

describe('what the user is told', () => {
  it('names the previous attempt only when there was one', () => {
    const fresh = scenarioProfile([], 'interview');
    const notes = observations(numbers(), fresh, generateTargets(numbers(), null), 'interview');
    expect(notes.some(n => /previous/.test(n.text))).toBe(false);
  });

  it('credits a real improvement over the previous attempt', () => {
    const history = [session('interview', 1, { fillers: 9 })];
    const p = scenarioProfile(history, 'interview');
    const notes = observations(numbers({ fillers: 4 }), p, generateTargets(numbers({ fillers: 4 }), null), 'interview');
    expect(notes.some(n => n.text.includes('improved from your previous interview attempt'))).toBe(true);
  });

  it('never diagnoses anything', () => {
    const history = [
      session('interview', 1, { fillers: 9, pauses: 14 }),
      session('interview', 3, { fillers: 8, pauses: 15 }),
      session('interview', 5, { fillers: 10, pauses: 16 }),
    ];
    const p = scenarioProfile(history, 'interview');
    const now = numbers({ fillers: 9, pauses: 15 });
    const targets = generateTargets(now, p.focus);
    const text = [
      ...observations(now, p, targets, 'interview').map(o => o.text),
      recommendationSentence(p, targets, drillFor(focusFor(p, now), p), 'interview'),
    ].join(' ').toLowerCase();

    for (const word of ['disorder', 'diagnos', 'therapy', 'treatment', 'cure', 'stutter', 'clinical', 'symptom']) {
      expect(text, word).not.toContain(word);
    }
  });
});

describe('reading stored sessions back', () => {
  it('treats a stored zero pace as "no pace", never as a pace of zero', () => {
    const n = numbersFromSession(session('interview', 1, { wpm: 0 }));
    expect(n.wpm).toBeNull();
  });

  it('picks a focus from the session itself while the baseline is building', () => {
    const empty = scenarioProfile([], 'interview');
    expect(focusFor(empty, numbers({ fillers: 12 }))).toBe('fillers');
    expect(focusFor(empty, numbers({ wpm: 130, pauses: 1, fillers: 0, repetitions: 0 }))).toBe('pace');
  });
});
