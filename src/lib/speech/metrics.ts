/**
 * Speech metrics — pure functions over a transcript and the timing of the
 * recognition events that produced it. Nothing here touches the network, a
 * model, or the DOM: every number the UI shows is computed right here.
 */

export const DEFAULT_PAUSE_THRESHOLD_MS = 800;

/** Lowercased, punctuation-stripped word tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function wordCount(text: string): number {
  return tokenize(text).length;
}

/**
 * Words per minute over the time actually spent speaking.
 * `activeSpeechMs` should already exclude long pauses where the caller can
 * measure them; it falls back to the whole session otherwise.
 */
export function wordsPerMinute(finalTranscript: string, activeSpeechMs: number): number {
  const words = wordCount(finalTranscript);
  if (words === 0 || activeSpeechMs <= 0) return 0;
  const wpm = words / (activeSpeechMs / 60000);
  return Math.round(wpm * 10) / 10;
}

export interface SpeechEvent {
  /** ms since session start when the recognition result arrived */
  at: number;
  /** text of the (final) result */
  text?: string;
}

export interface PauseResult {
  count: number;
  /** ms offsets where a pause started, for the timeline ticks */
  at: number[];
  totalPausedMs: number;
}

/**
 * Gaps between recognition results longer than `thresholdMs`. The Web Speech
 * API does not expose word timings, so a "pause" here is honestly defined as
 * silence between recognised phrases — the UI says so too.
 */
export function countPauses(
  events: SpeechEvent[],
  thresholdMs: number = DEFAULT_PAUSE_THRESHOLD_MS
): PauseResult {
  const out: PauseResult = { count: 0, at: [], totalPausedMs: 0 };
  for (let i = 1; i < events.length; i++) {
    const gap = events[i].at - events[i - 1].at;
    if (gap > thresholdMs) {
      out.count++;
      out.at.push(events[i - 1].at);
      out.totalPausedMs += gap;
    }
  }
  return out;
}

export interface RepetitionResult {
  count: number;
  /** the repeated tokens, most repeated first */
  tokens: Array<{ token: string; times: number }>;
}

/**
 * Immediate repeats of a word ("I I I") or a short bigram ("can you can you").
 * Each extra occurrence beyond the first counts once.
 */
export function countRepetitions(tokens: string[]): RepetitionResult {
  const tally = new Map<string, number>();
  let count = 0;

  // unigram repeats
  let i = 0;
  while (i < tokens.length) {
    let run = 1;
    while (i + run < tokens.length && tokens[i + run] === tokens[i]) run++;
    if (run > 1) {
      count += run - 1;
      tally.set(tokens[i], (tally.get(tokens[i]) ?? 0) + run - 1);
      i += run;
    } else {
      i++;
    }
  }

  // bigram repeats, skipping spans already counted as unigram runs
  for (let j = 0; j + 3 < tokens.length; j++) {
    const a = tokens[j], b = tokens[j + 1];
    if (a === b) continue;
    if (tokens[j + 2] === a && tokens[j + 3] === b) {
      const key = `${a} ${b}`;
      count += 1;
      tally.set(key, (tally.get(key) ?? 0) + 1);
      j += 3;
    }
  }

  return {
    count,
    tokens: [...tally.entries()]
      .map(([token, times]) => ({ token, times }))
      .sort((x, y) => y.times - x.times),
  };
}

export interface FillerResult {
  count: number;
  hits: Array<{ word: string; times: number }>;
}

/**
 * Counts filler words and multi-word fillers ("you know") from the user's own
 * editable list.
 */
export function countFillers(tokens: string[], list: string[]): FillerResult {
  const tally = new Map<string, number>();
  const normalized = list
    .map(w => w.trim().toLowerCase())
    .filter(Boolean)
    .map(w => w.split(/\s+/));

  for (const phrase of normalized) {
    if (phrase.length === 1) {
      const times = tokens.filter(t => t === phrase[0]).length;
      if (times) tally.set(phrase[0], (tally.get(phrase[0]) ?? 0) + times);
    } else {
      let times = 0;
      for (let i = 0; i + phrase.length <= tokens.length; i++) {
        if (phrase.every((p, k) => tokens[i + k] === p)) { times++; i += phrase.length - 1; }
      }
      if (times) tally.set(phrase.join(' '), (tally.get(phrase.join(' ')) ?? 0) + times);
    }
  }

  const hits = [...tally.entries()].map(([word, times]) => ({ word, times }))
    .sort((a, b) => b.times - a.times);
  return { count: hits.reduce((s, h) => s + h.times, 0), hits };
}

export interface SessionMetrics {
  words: number;
  wordsPerMinute: number;
  pauseCount: number;
  pauseAt: number[];
  repetitionCount: number;
  repeatedTokens: Array<{ token: string; times: number }>;
  fillerCount: number;
  fillerHits: Array<{ word: string; times: number }>;
  durationMs: number;
  activeSpeechMs: number;
}

/** One call the UI can make on every transcript change. */
export function computeMetrics(
  transcript: string,
  events: SpeechEvent[],
  durationMs: number,
  fillerWords: string[],
  pauseThresholdMs: number = DEFAULT_PAUSE_THRESHOLD_MS
): SessionMetrics {
  const tokens = tokenize(transcript);
  const pauses = countPauses(events, pauseThresholdMs);
  const activeSpeechMs = Math.max(0, durationMs - pauses.totalPausedMs) || durationMs;
  const reps = countRepetitions(tokens);
  const fillers = countFillers(tokens, fillerWords);
  return {
    words: tokens.length,
    wordsPerMinute: wordsPerMinute(transcript, activeSpeechMs),
    pauseCount: pauses.count,
    pauseAt: pauses.at,
    repetitionCount: reps.count,
    repeatedTokens: reps.tokens,
    fillerCount: fillers.count,
    fillerHits: fillers.hits,
    durationMs,
    activeSpeechMs,
  };
}

/* ---------------------------------------------------------------- typed mode */

/**
 * Typed transcripts carry no audio timing, so a pause can only be something
 * the writer marks themselves: an ellipsis ("...", "…") or a dash break
 * ("—", "--"). The UI states this rule next to the textarea rather than
 * inventing pause counts that were never observed.
 */
export function countTypedPauses(text: string): PauseResult {
  const markers = /(\.{3,}|…|—|--)/g;
  const at: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = markers.exec(text)) !== null) at.push(m.index);
  return { count: at.length, at, totalPausedMs: 0 };
}

/** Metrics for a transcript the user typed, with a duration they state. */
export function metricsFromTypedTranscript(
  text: string,
  durationMs: number,
  fillerWords: string[]
): SessionMetrics {
  const tokens = tokenize(text);
  const pauses = countTypedPauses(text);
  const reps = countRepetitions(tokens);
  const fillers = countFillers(tokens, fillerWords);
  return {
    words: tokens.length,
    wordsPerMinute: wordsPerMinute(text, durationMs),
    pauseCount: pauses.count,
    pauseAt: pauses.at,
    repetitionCount: reps.count,
    repeatedTokens: reps.tokens,
    fillerCount: fillers.count,
    fillerHits: fillers.hits,
    durationMs,
    activeSpeechMs: durationMs,
  };
}
