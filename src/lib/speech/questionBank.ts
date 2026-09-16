/**
 * The practice question bank — structured, local and deterministic.
 *
 * Every prompt the Speech Companion ever shows comes from this file or, for
 * Custom practice, from the user's own words shaped by `customQuestion`. There
 * is no model and no network call behind any of it: given the same history the
 * same question comes back, which is what makes the selection testable and what
 * keeps the deployed app free of any paid AI service.
 */
import type { Scenario } from '../../types';

/** What a prompt mainly gives the speaker practice at. */
export type PracticeSkill =
  | 'introduction'
  | 'storytelling'
  | 'explanation'
  | 'problem_solving'
  | 'persuasion'
  | 'small_talk'
  | 'request';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface PracticeQuestion {
  id: string;
  scenario: Scenario;
  difficulty: Difficulty;
  /** how long a complete answer should take, in seconds */
  durationTarget: number;
  skill: PracticeSkill;
  /** the question, prompt or situation itself */
  prompt: string;
  /**
   * What the speaker is being asked to do. Used where the situation alone does
   * not say it — a phone call is a setting, "explain the problem and ask when
   * it will arrive" is the task.
   */
  task?: string;
  /** one calm line shown under the prompt; never an instruction to perform */
  note?: string;
}

/* ----------------------------------------------------------------- the bank */

const INTERVIEW: PracticeQuestion[] = [
  {
    id: 'iv-about-you',
    scenario: 'interview',
    difficulty: 'beginner',
    durationTarget: 60,
    skill: 'introduction',
    prompt: 'Tell me about yourself and your background.',
    note: 'Answer naturally. There is no perfect response.',
  },
  {
    id: 'iv-why-role',
    scenario: 'interview',
    difficulty: 'beginner',
    durationTarget: 45,
    skill: 'persuasion',
    prompt: 'Why are you interested in this role?',
    note: 'Two or three honest reasons are plenty.',
  },
  {
    id: 'iv-proud-project',
    scenario: 'interview',
    difficulty: 'intermediate',
    durationTarget: 75,
    skill: 'storytelling',
    prompt: 'Tell me about a project you are proud of.',
    note: 'What it was, what you did, how it turned out.',
  },
  {
    id: 'iv-difficult-problem',
    scenario: 'interview',
    difficulty: 'intermediate',
    durationTarget: 75,
    skill: 'problem_solving',
    prompt: 'Describe a difficult problem you solved.',
    note: 'The problem, your approach, the result.',
  },
  {
    id: 'iv-strengths',
    scenario: 'interview',
    difficulty: 'beginner',
    durationTarget: 45,
    skill: 'persuasion',
    prompt: 'What are your strengths?',
    note: 'Name them, then give one example each.',
  },
  {
    id: 'iv-teamwork',
    scenario: 'interview',
    difficulty: 'intermediate',
    durationTarget: 60,
    skill: 'storytelling',
    prompt: 'Tell me about a time you worked in a team.',
    note: 'One situation is enough — stay with it.',
  },
  {
    id: 'iv-technical-project',
    scenario: 'interview',
    difficulty: 'advanced',
    durationTarget: 90,
    skill: 'explanation',
    prompt: 'Tell me about a technical project you worked on.',
    note: 'Assume the interviewer has not seen your code.',
  },
  {
    id: 'iv-development',
    scenario: 'interview',
    difficulty: 'intermediate',
    durationTarget: 45,
    skill: 'explanation',
    prompt: 'Where do you see yourself developing?',
    note: 'Where you are now, and where you are heading.',
  },
  {
    id: 'iv-why-you',
    scenario: 'interview',
    difficulty: 'advanced',
    durationTarget: 60,
    skill: 'persuasion',
    prompt: 'Why should we choose you?',
    note: 'Make the case once, clearly, then stop.',
  },
];

const PRESENTATION: PracticeQuestion[] = [
  {
    id: 'pr-technical-nontechnical',
    scenario: 'presentation',
    difficulty: 'intermediate',
    durationTarget: 60,
    skill: 'explanation',
    prompt: 'Explain a technical project you built to a non-technical audience.',
    note: 'No jargon. One idea at a time.',
  },
  {
    id: 'pr-passion-60',
    scenario: 'presentation',
    difficulty: 'beginner',
    durationTarget: 60,
    skill: 'persuasion',
    prompt: 'Give a 60-second explanation of an idea you are passionate about.',
    note: 'Say why it matters to you, not only what it is.',
  },
  {
    id: 'pr-teach-beginner',
    scenario: 'presentation',
    difficulty: 'intermediate',
    durationTarget: 75,
    skill: 'explanation',
    prompt: 'Explain a complex concept as if you were teaching it to a beginner.',
    note: 'Start from what they already know.',
  },
  {
    id: 'pr-project-60',
    scenario: 'presentation',
    difficulty: 'beginner',
    durationTarget: 60,
    skill: 'explanation',
    prompt: 'Explain your project in 60 seconds.',
    note: 'What it does, who it is for, why you built it.',
  },
  {
    id: 'pr-recommend-change',
    scenario: 'presentation',
    difficulty: 'advanced',
    durationTarget: 90,
    skill: 'persuasion',
    prompt: 'Present a change you would recommend to a group that has to approve it.',
    note: 'The problem, the proposal, what it costs.',
  },
  {
    id: 'pr-walkthrough',
    scenario: 'presentation',
    difficulty: 'advanced',
    durationTarget: 90,
    skill: 'storytelling',
    prompt: 'Walk an audience through how something you built works, start to finish.',
    note: 'Keep the order the audience needs, not the order you built it in.',
  },
];

const PHONE_CALL: PracticeQuestion[] = [
  {
    id: 'ph-delayed-order',
    scenario: 'phone_call',
    difficulty: 'beginner',
    durationTarget: 45,
    skill: 'request',
    prompt: 'You need to call a company because your order has not arrived.',
    task: 'Explain the problem clearly and ask when you can expect delivery.',
  },
  {
    id: 'ph-appointment',
    scenario: 'phone_call',
    difficulty: 'beginner',
    durationTarget: 30,
    skill: 'request',
    prompt: 'You are calling to schedule an appointment.',
    task: 'Say who you are, what you need, and when you are free.',
  },
  {
    id: 'ph-support',
    scenario: 'phone_call',
    difficulty: 'intermediate',
    durationTarget: 60,
    skill: 'problem_solving',
    prompt: 'You are calling customer support to explain a problem.',
    task: 'Describe what happened, what you already tried, and what you need.',
  },
  {
    id: 'ph-reschedule',
    scenario: 'phone_call',
    difficulty: 'beginner',
    durationTarget: 30,
    skill: 'request',
    prompt: 'You need to reschedule a meeting.',
    task: 'Explain briefly why, then propose two other times.',
  },
  {
    id: 'ph-enquiry',
    scenario: 'phone_call',
    difficulty: 'intermediate',
    durationTarget: 45,
    skill: 'explanation',
    prompt: 'You are calling a course or programme to ask whether you qualify.',
    task: 'Give your situation in a few sentences, then ask your question.',
  },
  {
    id: 'ph-billing',
    scenario: 'phone_call',
    difficulty: 'advanced',
    durationTarget: 60,
    skill: 'persuasion',
    prompt: 'You are calling about a charge you did not expect on a bill.',
    task: 'Set out the facts calmly and ask for it to be looked into.',
  },
];

const INTRODUCTION: PracticeQuestion[] = [
  {
    id: 'in-classmate',
    scenario: 'introduction',
    difficulty: 'beginner',
    durationTarget: 30,
    skill: 'introduction',
    prompt: 'Introduce yourself to a new classmate.',
    note: 'Relaxed. This is not a pitch.',
  },
  {
    id: 'in-networking',
    scenario: 'introduction',
    difficulty: 'intermediate',
    durationTarget: 45,
    skill: 'introduction',
    prompt: 'Introduce yourself at a networking event.',
    note: 'Who you are, what you work on, what you are looking for.',
  },
  {
    id: 'in-project-team',
    scenario: 'introduction',
    difficulty: 'intermediate',
    durationTarget: 45,
    skill: 'introduction',
    prompt: 'Introduce yourself to a new project team.',
    note: 'What you bring, and how you like to work.',
  },
  {
    id: 'in-thirty-seconds',
    scenario: 'introduction',
    difficulty: 'beginner',
    durationTarget: 30,
    skill: 'introduction',
    prompt: 'Give a 30-second introduction about yourself.',
    note: 'Short is the exercise.',
  },
  {
    id: 'in-what-you-do',
    scenario: 'introduction',
    difficulty: 'advanced',
    durationTarget: 45,
    skill: 'explanation',
    prompt: 'Someone asks what you do. Explain it to a person outside your field.',
    note: 'Plain words only.',
  },
];

const CONVERSATION: PracticeQuestion[] = [
  {
    id: 'cv-weekend',
    scenario: 'conversation',
    difficulty: 'beginner',
    durationTarget: 30,
    skill: 'small_talk',
    prompt: 'Someone asks what you did over the weekend.',
    note: 'Just talk. This one is meant to be easy.',
  },
  {
    id: 'cv-shared-interest',
    scenario: 'conversation',
    difficulty: 'beginner',
    durationTarget: 45,
    skill: 'small_talk',
    prompt: 'You meet someone who turns out to share one of your interests.',
    note: 'Say what got you into it.',
  },
  {
    id: 'cv-hobbies',
    scenario: 'conversation',
    difficulty: 'beginner',
    durationTarget: 30,
    skill: 'small_talk',
    prompt: 'Someone asks you about your hobbies.',
    note: 'One or two, in as much detail as you like.',
  },
  {
    id: 'cv-explain-friend',
    scenario: 'conversation',
    difficulty: 'intermediate',
    durationTarget: 45,
    skill: 'explanation',
    prompt: 'You are explaining something interesting to a friend.',
    note: 'The way you would actually say it to them.',
  },
  {
    id: 'cv-recent-change',
    scenario: 'conversation',
    difficulty: 'intermediate',
    durationTarget: 45,
    skill: 'storytelling',
    prompt: 'A friend asks what you have been up to lately.',
    note: 'Pick one thing and stay with it.',
  },
];

export const QUESTION_BANK: Record<Scenario, PracticeQuestion[]> = {
  interview: INTERVIEW,
  presentation: PRESENTATION,
  phone_call: PHONE_CALL,
  introduction: INTRODUCTION,
  conversation: CONVERSATION,
  // Custom practice is written by the user; `customQuestion` builds it.
  custom: [],
};

/** How many questions a multi-question scenario walks through in one sitting. */
export const SESSION_LENGTH: Record<Scenario, number> = {
  interview: 5,
  presentation: 3,
  phone_call: 3,
  introduction: 3,
  conversation: 3,
  custom: 1,
};

/* ------------------------------------------------------------- custom mode */

const CUSTOM_MIN_LENGTH = 3;

/**
 * Turns the user's own description of a situation into a practice prompt.
 *
 * This is deliberately a small amount of string handling, not a generator: it
 * keeps the user's words, tidies the sentence and picks a duration from how
 * much they wrote. Anything cleverer would need a model the deployed app is not
 * allowed to depend on, and would put words in the user's mouth.
 */
export function customQuestion(description: string): PracticeQuestion | null {
  const text = description.trim().replace(/\s+/g, ' ');
  if (text.length < CUSTOM_MIN_LENGTH) return null;

  const sentence = /[.!?]$/.test(text) ? text : `${text}.`;
  const prompt = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  // Longer descriptions tend to describe longer things to say.
  const words = text.split(' ').length;
  const durationTarget = words <= 8 ? 45 : words <= 20 ? 60 : 90;

  return {
    id: 'custom',
    scenario: 'custom',
    difficulty: 'intermediate',
    durationTarget,
    skill: 'explanation',
    prompt,
    task: 'Practise it out loud, the way you would actually say it.',
    note: 'InSign measures how you speak, not whether the content is right.',
  };
}

/* --------------------------------------------------------------- selection */

/** Difficulty a speaker with this much history in a scenario is offered. */
export function difficultyFor(sessionCount: number): Difficulty {
  if (sessionCount < 3) return 'beginner';
  if (sessionCount < 8) return 'intermediate';
  return 'advanced';
}

const DIFFICULTY_ORDER: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

export interface SelectionInput {
  scenario: Scenario;
  /** how many sessions this user has already saved in this scenario */
  sessionCount: number;
  /** position within the current sitting, 0-based */
  index?: number;
  /** the skill the user's recurring weakness is best practised through */
  preferSkill?: PracticeSkill | null;
  /** question ids to avoid repeating, most recent first */
  avoidIds?: string[];
}

/**
 * Picks the question for a slot.
 *
 * The order is deterministic — the same history always produces the same
 * question — but it is not a fixed list. Three things shape it, in order:
 * questions matching the skill behind the user's recurring weakness come first,
 * then questions at the difficulty their history has earned, and within that a
 * rotation offset by how many sessions they have already done, so a returning
 * user does not get question one again. Anything named in `avoidIds` is pushed
 * to the back rather than removed, so a short bank can still fill a sitting.
 */
export function selectQuestion(input: SelectionInput): PracticeQuestion | null {
  const ordered = orderQuestions(input);
  if (!ordered.length) return null;
  const index = input.index ?? 0;
  return ordered[index % ordered.length];
}

/** The whole bank for a scenario in the order `selectQuestion` walks it. */
export function orderQuestions(input: SelectionInput): PracticeQuestion[] {
  const bank = QUESTION_BANK[input.scenario] ?? [];
  if (!bank.length) return [];

  const wanted = difficultyFor(input.sessionCount);
  const wantedRank = DIFFICULTY_ORDER.indexOf(wanted);
  const avoid = input.avoidIds ?? [];

  // Rotation: a returning speaker starts further into the bank than a new one.
  const offset = bank.length ? input.sessionCount % bank.length : 0;
  const rotated = [...bank.slice(offset), ...bank.slice(0, offset)];

  return rotated
    .map((q, i) => ({ q, i }))
    .sort((a, b) => {
      // 1. A question that exercises the skill behind the weakness comes first.
      const skillA = input.preferSkill && a.q.skill === input.preferSkill ? 0 : 1;
      const skillB = input.preferSkill && b.q.skill === input.preferSkill ? 0 : 1;
      if (skillA !== skillB) return skillA - skillB;

      // 2. Recently answered questions go to the back of their group.
      const seenA = avoid.indexOf(a.q.id);
      const seenB = avoid.indexOf(b.q.id);
      const freshA = seenA === -1 ? 0 : 1;
      const freshB = seenB === -1 ? 0 : 1;
      if (freshA !== freshB) return freshA - freshB;

      // 3. Closest to the difficulty their history has earned.
      const distA = Math.abs(DIFFICULTY_ORDER.indexOf(a.q.difficulty) - wantedRank);
      const distB = Math.abs(DIFFICULTY_ORDER.indexOf(b.q.difficulty) - wantedRank);
      if (distA !== distB) return distA - distB;

      // 4. Rotation order, which is itself deterministic.
      return a.i - b.i;
    })
    .map(x => x.q);
}

/** Looks a question up by id — how Practice Again holds on to the same one. */
export function questionById(id: string): PracticeQuestion | null {
  for (const list of Object.values(QUESTION_BANK)) {
    const found = list.find(q => q.id === id);
    if (found) return found;
  }
  return null;
}
