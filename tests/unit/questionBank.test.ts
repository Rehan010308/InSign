import { describe, expect, it } from 'vitest';
import {
  QUESTION_BANK, SESSION_LENGTH, customQuestion, difficultyFor, orderQuestions,
  questionById, selectQuestion,
} from '../../src/lib/speech/questionBank';
import { SCENARIOS, type Scenario } from '../../src/types';

const SPOKEN: Scenario[] = SCENARIOS.filter(s => s !== 'custom');

describe('the bank itself', () => {
  it('has questions for every scenario except custom, which the user writes', () => {
    for (const scenario of SPOKEN) {
      expect(QUESTION_BANK[scenario].length, scenario).toBeGreaterThanOrEqual(5);
    }
    expect(QUESTION_BANK.custom).toEqual([]);
  });

  it('gives every question complete, valid metadata', () => {
    for (const scenario of SPOKEN) {
      for (const q of QUESTION_BANK[scenario]) {
        expect(q.scenario, q.id).toBe(scenario);
        expect(q.prompt.length, q.id).toBeGreaterThan(10);
        expect(['beginner', 'intermediate', 'advanced'], q.id).toContain(q.difficulty);
        expect(q.durationTarget, q.id).toBeGreaterThanOrEqual(30);
        expect(q.durationTarget, q.id).toBeLessThanOrEqual(120);
        expect(q.skill, q.id).toBeTruthy();
      }
    }
  });

  it('uses a unique id for every question, so Practice Again can hold one', () => {
    const ids = SPOKEN.flatMap(s => QUESTION_BANK[s].map(q => q.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(questionById('iv-about-you')?.prompt).toContain('Tell me about yourself');
    expect(questionById('no-such-question')).toBeNull();
  });

  it('gives a phone call a situation and the task it sets', () => {
    for (const q of QUESTION_BANK.phone_call) {
      expect(q.task, q.id).toBeTruthy();
    }
  });

  it('walks an interview through several questions in one sitting', () => {
    expect(SESSION_LENGTH.interview).toBe(5);
    expect(SESSION_LENGTH.custom).toBe(1);
  });
});

describe('selection', () => {
  it('is deterministic: the same history always gives the same question', () => {
    const input = { scenario: 'interview' as const, sessionCount: 4, index: 0 };
    const a = selectQuestion(input);
    const b = selectQuestion({ ...input });
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
  });

  it('walks a sitting without repeating a question', () => {
    const seen = new Set<string>();
    for (let i = 0; i < SESSION_LENGTH.interview; i++) {
      const q = selectQuestion({ scenario: 'interview', sessionCount: 0, index: i });
      expect(q).not.toBeNull();
      expect(seen.has(q!.id)).toBe(false);
      seen.add(q!.id);
    }
  });

  it('does not open with the same question for a returning speaker', () => {
    const first = selectQuestion({ scenario: 'interview', sessionCount: 0, index: 0 });
    const later = selectQuestion({ scenario: 'interview', sessionCount: 3, index: 0 });
    expect(first!.id).not.toBe(later!.id);
  });

  it('pushes recently answered questions to the back rather than dropping them', () => {
    const avoid = ['iv-about-you', 'iv-why-role'];
    const ordered = orderQuestions({ scenario: 'interview', sessionCount: 0, avoidIds: avoid });
    expect(ordered.length).toBe(QUESTION_BANK.interview.length);
    const positions = avoid.map(id => ordered.findIndex(q => q.id === id));
    for (const p of positions) expect(p).toBeGreaterThan(ordered.length - 1 - avoid.length - 1);
  });

  it('puts a question that exercises the weak skill first', () => {
    const ordered = orderQuestions({
      scenario: 'interview', sessionCount: 0, preferSkill: 'explanation',
    });
    expect(ordered[0].skill).toBe('explanation');
  });

  it('offers harder questions only once there is history behind them', () => {
    expect(difficultyFor(0)).toBe('beginner');
    expect(difficultyFor(2)).toBe('beginner');
    expect(difficultyFor(3)).toBe('intermediate');
    expect(difficultyFor(12)).toBe('advanced');

    const early = selectQuestion({ scenario: 'presentation', sessionCount: 0, index: 0 });
    expect(early!.difficulty).toBe('beginner');
  });

  it('has nothing to offer for custom practice — the user writes it', () => {
    expect(selectQuestion({ scenario: 'custom', sessionCount: 0 })).toBeNull();
  });
});

describe('custom practice', () => {
  it('turns a described situation into a prompt in the user own words', () => {
    const q = customQuestion('  i have to explain my robotics project to a professor  ');
    expect(q).not.toBeNull();
    expect(q!.prompt).toBe('I have to explain my robotics project to a professor.');
    expect(q!.scenario).toBe('custom');
    expect(q!.task).toBeTruthy();
  });

  it('keeps punctuation the user already wrote', () => {
    expect(customQuestion('Can I explain this clearly?')!.prompt).toBe('Can I explain this clearly?');
  });

  it('gives longer descriptions a longer suggested duration', () => {
    const short = customQuestion('Explain my project.')!;
    const long = customQuestion(
      'I need to explain the whole architecture of the system I built to a room of people who have never seen any of it before and will ask questions'
    )!;
    expect(long.durationTarget).toBeGreaterThan(short.durationTarget);
  });

  it('refuses an empty description rather than inventing one', () => {
    expect(customQuestion('')).toBeNull();
    expect(customQuestion('   ')).toBeNull();
  });
});
