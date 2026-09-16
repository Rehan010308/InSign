/**
 * The practice coach — scenario-specific, deterministic, and built only from
 * sessions the user actually saved.
 *
 * Everything here is a pure function of stored history: the profile for a
 * scenario, the measurable target that follows a session, the drill that goes
 * with it, and the comparison after a second attempt. No model, no network, no
 * invented history — when there is not enough evidence the answer is "building
 * your baseline", not a confident guess.
 *
 * Deliberately absent: any claim about the *content* of what was said. The
 * system measures speaking behaviour — pace, pauses, fillers, repetitions — and
 * says so. It is communication practice, not assessment of any other kind.
 */
import type { Scenario, SpeechSession } from '../../types';
import type { PracticeSkill } from './questionBank';
import type { SessionMetrics } from './metrics';

/* ------------------------------------------------------------- tuneables */

/** Below this many sessions in a scenario, the coach is still learning. */
export const MIN_SESSIONS_FOR_PATTERN = 3;

/**
 * A comfortable speaking band for practice, in words per minute. It is a
 * reference for setting the next step, not a verdict: nothing outside it is
 * called wrong, and the coach never moves someone more than one step at a time.
 */
export const COMFORTABLE_PACE = { min: 110, max: 150 } as const;

/** Above these, a metric is worth putting a target on. */
const GENTLE_LIMITS = { pauses: 6, fillers: 3, repetitions: 2 } as const;

/** Drill lengths, shortest first — adaptive difficulty walks this ladder. */
export const DRILL_LADDER = [30, 45, 60] as const;

export type FocusMetric = 'pace' | 'pauses' | 'fillers' | 'repetitions';

export const FOCUS_LABELS: Record<FocusMetric, string> = {
  pace: 'Pace',
  pauses: 'Pauses',
  fillers: 'Fillers',
  repetitions: 'Repetitions',
};

/** Fixed order wherever several metrics are shown or tie on severity. */
export const FOCUS_ORDER: FocusMetric[] = ['pace', 'pauses', 'fillers', 'repetitions'];

/* --------------------------------------------------------------- numbers */

/** The four measured behaviours, from either a live session or a stored row. */
export interface SessionNumbers {
  /** null when the session was too short to state a pace */
  wpm: number | null;
  pauses: number;
  fillers: number;
  repetitions: number;
  durationMs: number;
  words: number;
}

export function numbersFromMetrics(m: SessionMetrics): SessionNumbers {
  return {
    wpm: m.wordsPerMinute,
    pauses: m.pauseCount,
    fillers: m.fillerCount,
    repetitions: m.repetitionCount,
    durationMs: m.durationMs,
    words: m.words,
  };
}

/**
 * A stored row carries 0 where a session had no statable pace, because the
 * column cannot hold null. Zero is read back as "no pace", never as a pace.
 */
export function numbersFromSession(s: SpeechSession): SessionNumbers {
  const words = Math.max(0, Math.round((s.words_per_minute * s.duration_ms) / 60000));
  return {
    wpm: s.words_per_minute > 0 ? s.words_per_minute : null,
    pauses: s.pause_count,
    fillers: s.filler_count,
    repetitions: s.repetition_count,
    durationMs: s.duration_ms,
    words,
  };
}

export function valueOf(n: SessionNumbers, metric: FocusMetric): number | null {
  switch (metric) {
    case 'pace': return n.wpm;
    case 'pauses': return n.pauses;
    case 'fillers': return n.fillers;
    case 'repetitions': return n.repetitions;
  }
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round5 = (n: number) => Math.round(n / 5) * 5;

/* --------------------------------------------------------------- profile */

export type TrendLabel = 'improving' | 'steady' | 'recurring' | 'building';

export const TREND_COPY: Record<TrendLabel, string> = {
  improving: 'Improving',
  steady: 'Steady',
  recurring: 'Recurring focus',
  building: 'Building',
};

export interface ScenarioProfile {
  scenario: Scenario;
  /** this scenario's sessions only, newest first */
  sessions: SpeechSession[];
  count: number;
  /** true while there is not yet enough history in this scenario to claim one */
  baseline: boolean;
  latest: SessionNumbers | null;
  previous: SessionNumbers | null;
  medians: { wpm: number | null; pauses: number | null; fillers: number | null; repetitions: number | null };
  trends: Record<FocusMetric, TrendLabel>;
  /** the behaviour worth working on next, or null while still building */
  focus: FocusMetric | null;
}

function chronological(sessions: SpeechSession[]): SpeechSession[] {
  return [...sessions].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

/**
 * How far a metric sits beyond what is worth working on, as a ratio. Zero means
 * "nothing to do here"; bigger means the behaviour shows up more.
 */
function severity(metric: FocusMetric, value: number | null): number {
  if (value === null) return 0;
  if (metric === 'pace') {
    if (value < COMFORTABLE_PACE.min) return (COMFORTABLE_PACE.min - value) / COMFORTABLE_PACE.min;
    if (value > COMFORTABLE_PACE.max) return (value - COMFORTABLE_PACE.max) / COMFORTABLE_PACE.max;
    return 0;
  }
  const limit = GENTLE_LIMITS[metric];
  return value > limit ? (value - limit) / limit : 0;
}

/** Later half against earlier half, for one metric of one scenario. */
function trendOf(metric: FocusMetric, chrono: SpeechSession[]): TrendLabel {
  if (chrono.length < MIN_SESSIONS_FOR_PATTERN) return 'building';
  const values = chrono.map(s => valueOf(numbersFromSession(s), metric));
  const known = values.filter((v): v is number => v !== null);
  if (known.length < MIN_SESSIONS_FOR_PATTERN) return 'building';

  const half = Math.floor(known.length / 2);
  const early = median(known.slice(0, half));
  const late = median(known.slice(Math.ceil(known.length / 2)));
  if (early === null || late === null) return 'building';

  if (metric === 'pace') {
    // "Better" for pace means closer to the comfortable band, in either
    // direction — speaking faster is not automatically an improvement.
    const distance = (v: number) =>
      v < COMFORTABLE_PACE.min ? COMFORTABLE_PACE.min - v
        : v > COMFORTABLE_PACE.max ? v - COMFORTABLE_PACE.max : 0;
    const before = distance(early), after = distance(late);
    if (before === 0 && after === 0) return 'steady';
    if (after < before * 0.85) return 'improving';
    if (after > before * 1.15) return 'recurring';
    return 'steady';
  }

  if (early === 0 && late === 0) return 'steady';
  if (late < early * 0.85) return 'improving';
  if (late > early * 1.15) return 'recurring';
  return 'steady';
}

/**
 * Builds the picture of one scenario from the user's own sessions in it.
 *
 * Interview history shapes interview practice and nothing else: the sessions
 * are filtered by scenario before anything is measured, so a talkative
 * conversation round cannot flatter an interview profile.
 */
export function scenarioProfile(all: SpeechSession[], scenario: Scenario): ScenarioProfile {
  const sessions = all
    .filter(s => s.scenario === scenario)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const chrono = chronological(sessions);
  const count = sessions.length;
  const baseline = count < MIN_SESSIONS_FOR_PATTERN;

  const numbers = sessions.map(numbersFromSession);
  const medians = {
    wpm: median(numbers.map(n => n.wpm).filter((v): v is number => v !== null)),
    pauses: median(numbers.map(n => n.pauses)),
    fillers: median(numbers.map(n => n.fillers)),
    repetitions: median(numbers.map(n => n.repetitions)),
  };

  const trends = {
    pace: trendOf('pace', chrono),
    pauses: trendOf('pauses', chrono),
    fillers: trendOf('fillers', chrono),
    repetitions: trendOf('repetitions', chrono),
  } as Record<FocusMetric, TrendLabel>;

  // The focus is whichever behaviour shows up most against the gentle limits,
  // measured on the scenario's own median so one loud session cannot set it.
  let focus: FocusMetric | null = null;
  if (!baseline) {
    let best = 0;
    for (const metric of FOCUS_ORDER) {
      const value = metric === 'pace' ? medians.wpm
        : metric === 'pauses' ? medians.pauses
        : metric === 'fillers' ? medians.fillers : medians.repetitions;
      const score = severity(metric, value);
      // Strictly greater keeps FOCUS_ORDER as the tie-break.
      if (score > best) { best = score; focus = metric; }
    }
  }

  return {
    scenario,
    sessions,
    count,
    baseline,
    latest: numbers[0] ?? null,
    previous: numbers[1] ?? null,
    medians,
    trends,
    focus,
  };
}

/**
 * The behaviour to work on next.
 *
 * Stored history decides it wherever there is enough of it; while a baseline is
 * still being built, the session that just happened does, so a first-time user
 * still gets a target drawn from something real rather than a default.
 */
export function focusFor(profile: ScenarioProfile, now: SessionNumbers | null): FocusMetric {
  if (profile.focus) return profile.focus;
  if (now) {
    let best = 0;
    let picked: FocusMetric | null = null;
    for (const metric of FOCUS_ORDER) {
      const score = severity(metric, valueOf(now, metric));
      if (score > best) { best = score; picked = metric; }
    }
    if (picked) return picked;
  }
  // Nothing stands out: pace is the one behaviour every scenario has.
  return 'pace';
}

/* ---------------------------------------------------------------- targets */

export interface Target {
  metric: FocusMetric;
  /** upper bound for a count metric; upper end of the band for pace */
  max: number;
  /** lower end of the pace band; absent for count metrics */
  min?: number;
  /** what the UI prints: "100–115 WPM" or "≤ 4" */
  display: string;
  /** what the target is measured in, for the label under it */
  unit: string;
}

/** One step towards the comfortable band — never the whole distance at once. */
export function paceTarget(current: number | null): Target {
  const { min: IDEAL_MIN, max: IDEAL_MAX } = COMFORTABLE_PACE;
  let lo: number, hi: number;

  if (current === null) {
    lo = IDEAL_MIN; hi = IDEAL_MIN + 20;
  } else if (current < IDEAL_MIN) {
    lo = Math.min(round5(current + 8), IDEAL_MIN);
    hi = Math.min(lo + 15, IDEAL_MAX);
  } else if (current > IDEAL_MAX) {
    hi = Math.max(round5(current - 10), IDEAL_MAX);
    lo = Math.max(hi - 15, IDEAL_MIN);
  } else {
    // Already inside the band: the target is to stay there.
    lo = IDEAL_MIN; hi = IDEAL_MAX;
  }

  return { metric: 'pace', min: lo, max: hi, display: `${lo}–${hi} WPM`, unit: 'WORDS PER MINUTE' };
}

/**
 * A count target: a real reduction on what actually happened, at least one
 * fewer, never below zero. Made from the user's own last number, so it is
 * always reachable from where they are.
 */
export function countTarget(metric: Exclude<FocusMetric, 'pace'>, current: number): Target {
  const max = Math.max(0, Math.min(current - 1, Math.round(current * 0.65)));
  return {
    metric,
    max,
    display: `≤ ${max}`,
    unit: metric === 'pauses' ? 'PAUSES' : metric === 'fillers' ? 'FILLER WORDS' : 'REPETITIONS',
  };
}

export function targetFor(metric: FocusMetric, n: SessionNumbers): Target {
  if (metric === 'pace') return paceTarget(n.wpm);
  return countTarget(metric, valueOf(n, metric) as number);
}

/**
 * The one to three measurable targets that follow a session.
 *
 * The focus metric is always among them. The others join only when the session
 * actually showed something worth a number — no target is invented for a
 * behaviour that was already fine, and nothing here is ever phrased as advice
 * like "speak more clearly".
 */
export function generateTargets(
  n: SessionNumbers,
  focus: FocusMetric | null,
  limit = 3
): Target[] {
  const wanted: FocusMetric[] = [];
  const consider = (m: FocusMetric) => { if (!wanted.includes(m)) wanted.push(m); };

  if (focus) consider(focus);
  for (const metric of FOCUS_ORDER) {
    if (severity(metric, valueOf(n, metric)) > 0) consider(metric);
  }
  // A session with nothing out of band still deserves one thing to hold on to.
  if (!wanted.length) consider(n.wpm === null ? 'fillers' : 'pace');

  return FOCUS_ORDER
    .filter(m => wanted.includes(m))
    .slice(0, limit)
    .map(m => targetFor(m, n));
}

export type TargetStatus = 'reached' | 'almost' | 'keep';

export function meetsTarget(n: SessionNumbers, target: Target): TargetStatus {
  const value = valueOf(n, target.metric);
  if (value === null) return 'keep';

  if (target.metric === 'pace') {
    const lo = target.min ?? 0;
    if (value >= lo && value <= target.max) return 'reached';
    // Within ten words a minute of the band is close enough to say so.
    if (value >= lo - 10 && value <= target.max + 10) return 'almost';
    return 'keep';
  }

  if (value <= target.max) return 'reached';
  if (value <= target.max + 1) return 'almost';
  return 'keep';
}

export interface TargetComparison {
  metric: FocusMetric;
  label: string;
  from: number | null;
  to: number | null;
  target: Target;
  status: TargetStatus;
  /** true when the number moved the right way, whether or not it hit */
  improved: boolean;
}

/** What Practice Again shows: the same targets, measured again. */
export function compareToTargets(
  before: SessionNumbers | null,
  after: SessionNumbers,
  targets: Target[]
): TargetComparison[] {
  return targets.map(target => {
    const from = before ? valueOf(before, target.metric) : null;
    const to = valueOf(after, target.metric);
    let improved = false;
    if (from !== null && to !== null) {
      improved = target.metric === 'pace'
        ? Math.abs(to - midpoint(target)) < Math.abs(from - midpoint(target))
        : to < from;
    }
    return {
      metric: target.metric,
      label: FOCUS_LABELS[target.metric],
      from,
      to,
      target,
      status: meetsTarget(after, target),
      improved,
    };
  });
}

function midpoint(t: Target): number {
  return t.min !== undefined ? (t.min + t.max) / 2 : t.max;
}

/* ----------------------------------------------------------------- drills */

export interface Drill {
  focus: FocusMetric;
  title: string;
  instruction: string;
  /** how long the next attempt should run for */
  durationSec: number;
  /** 1–3 on DRILL_LADDER; lower is a simpler, shorter version of the same drill */
  level: number;
}

const DRILL_TEXT: Record<FocusMetric, { title: string; full: string; simple: string }> = {
  pace: {
    title: 'PACE CONTROL',
    full: 'Give a complete answer while staying inside your target pace range. Let the ends of sentences land rather than rushing into the next one.',
    simple: 'Answer in three sentences, at the speed you would use to give someone directions.',
  },
  pauses: {
    title: 'PAUSE CONTROL',
    full: 'Answer using short complete ideas. Put a deliberate pause between ideas instead of stopping in the middle of one.',
    simple: 'Answer in two short ideas. Finish the first one completely before starting the second.',
  },
  fillers: {
    title: 'FILLER CONTROL',
    full: 'Answer the same question again. Wherever you would normally say “um” or “like”, replace it with a deliberate silent pause.',
    simple: 'Answer in two sentences. Before each one, take a breath instead of starting with a filler word.',
  },
  repetitions: {
    title: 'REPETITION CONTROL',
    full: 'Answer using shorter phrases and deliberate starts. When you catch yourself restarting a phrase, pause and continue forward instead of going back.',
    simple: 'Answer one sentence at a time. Start each sentence once, and keep going even if it is not perfect.',
  },
};

/**
 * Counts how the last few attempts went against the target the attempt before
 * each one implied.
 *
 * This is what makes the difficulty adaptive without any stored target: because
 * a target is a pure function of the session before it, the target a past
 * attempt was working towards can be recomputed exactly rather than guessed.
 * Returns consecutive results from the newest attempt backwards.
 */
export function targetStreak(
  sessionsNewestFirst: SpeechSession[],
  metric: FocusMetric
): { hits: number; misses: number } {
  const chrono = chronological(sessionsNewestFirst);
  let hits = 0, misses = 0;
  for (let i = chrono.length - 1; i >= 1; i--) {
    const target = targetFor(metric, numbersFromSession(chrono[i - 1]));
    const status = meetsTarget(numbersFromSession(chrono[i]), target);
    if (status === 'reached') {
      if (misses) break;
      hits++;
    } else {
      if (hits) break;
      misses++;
    }
  }
  return { hits, misses };
}

/**
 * The drill for a focus, at the difficulty the user's own results have earned.
 *
 * Repeatedly reaching a target lengthens the drill — 30 seconds, then 45, then
 * 60. Repeatedly missing does *not* make the target harder: the target holds
 * and the drill gets simpler and shorter, so the skill is practised in
 * isolation rather than under more load.
 */
export function drillFor(
  focus: FocusMetric,
  profile: ScenarioProfile,
  questionDuration?: number
): Drill {
  const { hits, misses } = targetStreak(profile.sessions, focus);
  let level = 1 + Math.min(2, Math.floor(hits / 2));
  if (misses >= 2) level = 1;

  const text = DRILL_TEXT[focus];
  const simplify = misses >= 2;
  const ladder = DRILL_LADDER[level - 1];
  // Never ask for longer than the question itself is meant to take.
  const durationSec = questionDuration ? Math.min(ladder, questionDuration) : ladder;

  return {
    focus,
    title: text.title,
    instruction: simplify ? text.simple : text.full,
    durationSec,
    level,
  };
}

/* ------------------------------------------------------------- narratives */

/**
 * The skill a weakness is best practised through, used to bias which question
 * comes up next. Fillers cluster around the joins between ideas, so an
 * explanation gives the most of them to work on; pauses show up most in a
 * story; pace in a piece with a shape to hold; repetitions at the start of
 * sentences, which an introduction is made of.
 */
export const SKILL_FOR_FOCUS: Record<FocusMetric, PracticeSkill> = {
  pace: 'persuasion',
  pauses: 'storytelling',
  fillers: 'explanation',
  repetitions: 'introduction',
};

export interface Observation {
  /** short label the UI can emphasise */
  tone: 'good' | 'neutral' | 'focus';
  text: string;
}

/**
 * "What stood out" — two or three plain sentences about what was measured, each
 * one traceable to a number. Nothing here interprets the content of the answer,
 * and nothing is said about a previous attempt unless one exists.
 */
export function observations(
  now: SessionNumbers,
  profile: ScenarioProfile,
  targets: Target[],
  scenarioLabel: string
): Observation[] {
  const out: Observation[] = [];
  // `profile` is the history as it stood *before* this session, so the most
  // recent stored session is the attempt to compare against.
  const previous = profile.latest;

  const paceTargetNow = targets.find(t => t.metric === 'pace');
  if (now.wpm === null) {
    out.push({ tone: 'neutral', text: 'That answer was too short to state a pace — a little more speech and the pace appears.' });
  } else if (paceTargetNow && meetsTarget(now, paceTargetNow) === 'reached') {
    out.push({ tone: 'good', text: `Your pace is within your current ${scenarioLabel} target.` });
  } else {
    out.push({
      tone: 'neutral',
      text: `You spoke at ${Math.round(now.wpm)} words a minute across ${Math.round(now.durationMs / 1000)} seconds.`,
    });
  }

  if (previous) {
    const moved = FOCUS_ORDER.filter(m => m !== 'pace').find(m => {
      const a = valueOf(previous, m), b = valueOf(now, m);
      return a !== null && b !== null && b < a;
    });
    if (moved) {
      out.push({
        tone: 'good',
        text: `Your ${FOCUS_LABELS[moved].toLowerCase()} count improved from your previous ${scenarioLabel} attempt.`,
      });
    }
  }

  if (profile.focus) {
    out.push({
      tone: 'focus',
      text: `${FOCUS_LABELS[profile.focus]} remain your main focus in ${scenarioLabel} practice.`,
    });
  } else if (profile.baseline) {
    out.push({
      tone: 'neutral',
      text: `InSign is still learning your ${scenarioLabel} pattern — ${MIN_SESSIONS_FOR_PATTERN - profile.count} more session${MIN_SESSIONS_FOR_PATTERN - profile.count === 1 ? '' : 's'} and the recommendations get specific.`,
    });
  }

  return out.slice(0, 3);
}

/**
 * The single sentence stored as the open practice recommendation, so the
 * dashboard and history pages say the same thing this screen said.
 */
export function recommendationSentence(
  profile: ScenarioProfile,
  targets: Target[],
  drill: Drill | null,
  scenarioLabel: string
): string {
  if (profile.baseline) {
    const left = MIN_SESSIONS_FOR_PATTERN - profile.count;
    return `Building your ${scenarioLabel} baseline — ${left} more ${scenarioLabel} session${left === 1 ? '' : 's'} and InSign can set targets from your own pattern.`;
  }
  const headline = targets.map(t => `${FOCUS_LABELS[t.metric].toLowerCase()} ${t.display}`).join(', ');
  const next = drill ? ` ${drill.instruction}` : '';
  return `Next ${scenarioLabel} target: ${headline}.${next}`;
}
