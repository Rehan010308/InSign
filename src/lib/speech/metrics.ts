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
 * Below this much session there is no pace to report. It is not a ceiling on
 * the answer — it is a floor on the evidence: a fraction of a second of
 * measured session means the timing is wrong, not that the speaker is fast.
 * Above it the pace is reported exactly as computed, never clamped.
 */
export const MIN_MEASURABLE_MS = 1500;

/**
 * Words per minute over the session the words were spoken in.
 *
 * `durationMs` is the wall-clock length of the practice — from Start to Stop —
 * which is what a listener experiences as pace. It is measured by one timer
 * that no recognition restart can touch, so there is no subtraction left to
 * collapse towards zero (the 54,000 WPM bug). Below `MIN_MEASURABLE_MS` this
 * returns `null` — "not enough session to state a pace" — rather than a number
 * produced by dividing by almost nothing.
 */
export function wordsPerMinute(finalTranscript: string, durationMs: number): number | null {
  const words = wordCount(finalTranscript);
  if (words === 0) return 0;
  if (!Number.isFinite(durationMs) || durationMs < MIN_MEASURABLE_MS) return null;
  const wpm = words / (durationMs / 60000);
  return Math.round(wpm * 10) / 10;
}

export interface SpeechEvent {
  /** ms since session start when the final recognition result arrived */
  at: number;
  /**
   * ms since session start when this utterance's speech began — the first
   * result (interim or final) of the phrase. This is what makes a speaking
   * duration measurable: `at` alone is an arrival time, and the delay between
   * the last word and the final result is recognition latency, not speech.
   * Absent on events recorded without it; such events are not timed.
   */
  startedAt?: number;
  /**
   * True when this utterance is the first one heard after the recognition
   * service dropped out and was restarted. The gap in front of it is the
   * service reconnecting, not the speaker pausing, so pause detection skips it.
   */
  afterRestart?: boolean;
  /** text of the (final) result */
  text?: string;
}

/** One stretch of time the speaker was actually speaking. */
export interface SpeechSpan {
  start: number;
  end: number;
  /** carried through from the event, so pauses can skip reconnection gaps */
  afterRestart?: boolean;
}

/**
 * The utterance spans behind a list of recognition events.
 *
 * Each span runs from where the phrase started being heard to where its final
 * result landed. Spans are clipped so they never overlap, never run backwards
 * (a final result that arrives after Stop, or out of order, cannot invent
 * negative or duplicated time) and never start before the previous one ended.
 * Microphone and browser startup latency sits before the first span and is
 * therefore excluded by construction.
 */
export function speechSpans(events: SpeechEvent[]): SpeechSpan[] {
  const spans: SpeechSpan[] = [];
  let prevEnd: number | null = null;

  for (const e of events) {
    const end = e.at;
    if (!Number.isFinite(end)) continue;
    // Late or duplicated finals cannot extend time that has already been counted.
    if (prevEnd !== null && end <= prevEnd) continue;

    const declared = Number.isFinite(e.startedAt as number) ? (e.startedAt as number) : null;
    // With no start of its own, an utterance can only be timed from the end of
    // the previous one; the very first such event is left as a zero-length span
    // rather than credited with everything since the session began.
    let start = declared ?? prevEnd ?? end;
    if (start < (prevEnd ?? -Infinity)) start = prevEnd as number;
    if (start > end) start = end;

    spans.push(e.afterRestart ? { start, end, afterRestart: true } : { start, end });
    prevEnd = end;
  }
  return spans;
}

/** True when at least one event carries the start of its own utterance. */
export function hasSpanTiming(events: SpeechEvent[]): boolean {
  return events.some(e => Number.isFinite(e.startedAt as number));
}

/**
 * The measured speaking time: the total length of the utterance spans, never
 * more than the session itself lasted. Reported alongside the pace as "spoken
 * time", never divided into the word count.
 */
export function activeSpeechFromSpans(spans: SpeechSpan[], durationMs: number): number {
  const total = spans.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return total;
  return Math.min(total, durationMs);
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
    if (events[i].afterRestart) continue;
    const gap = events[i].at - events[i - 1].at;
    if (gap > thresholdMs) {
      out.count++;
      out.at.push(events[i - 1].at);
      out.totalPausedMs += gap;
    }
  }
  return out;
}

/**
 * Pauses between measured utterances: the silence from where one phrase
 * finished to where the next one started.
 *
 * Three kinds of gap are deliberately not pauses. The time before the first
 * span is microphone and service startup; the time after the last span is the
 * user reaching for Stop; and a gap in front of a span marked `afterRestart` is
 * the recognition service reconnecting. Only silence *between* two phrases the
 * same recognition run heard is counted.
 */
export function pausesFromSpans(
  spans: SpeechSpan[],
  thresholdMs: number = DEFAULT_PAUSE_THRESHOLD_MS
): PauseResult {
  const out: PauseResult = { count: 0, at: [], totalPausedMs: 0 };
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].afterRestart) continue;
    const gap = spans[i].start - spans[i - 1].end;
    if (gap > thresholdMs) {
      out.count++;
      out.at.push(spans[i - 1].end);
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

/** Longest phrase, in words, that counts as an immediate repeat. */
const MAX_REPEAT_PHRASE = 3;

/**
 * Immediate repeats of a word ("I I I") or of a short phrase ("can you can
 * you", "what I mean what I mean"). Each extra occurrence beyond the first
 * counts once. Tokens arrive lowercased and stripped of punctuation, so
 * "Well, well" and "well well" count alike.
 *
 * Single words are counted first and their tokens are then off limits, and
 * longer phrases are tried before shorter ones, so one restart is counted once
 * rather than once per length that happens to fit inside it.
 */
export function countRepetitions(tokens: string[]): RepetitionResult {
  const tally = new Map<string, number>();
  const claimed = new Array<boolean>(tokens.length).fill(false);
  let count = 0;

  // unigram repeats
  let i = 0;
  while (i < tokens.length) {
    let run = 1;
    while (i + run < tokens.length && tokens[i + run] === tokens[i]) run++;
    if (run > 1) {
      count += run - 1;
      tally.set(tokens[i], (tally.get(tokens[i]) ?? 0) + run - 1);
      for (let k = 0; k < run; k++) claimed[i + k] = true;
      i += run;
    } else {
      i++;
    }
  }

  // phrase repeats, longest first, over tokens no unigram run already claimed
  for (let len = MAX_REPEAT_PHRASE; len >= 2; len--) {
    for (let j = 0; j + 2 * len <= tokens.length; j++) {
      let match = true;
      for (let k = 0; k < 2 * len; k++) {
        if (claimed[j + k]) { match = false; break; }
      }
      if (match) {
        for (let k = 0; k < len; k++) {
          if (tokens[j + k] !== tokens[j + len + k]) { match = false; break; }
        }
      }
      if (!match) continue;
      const key = tokens.slice(j, j + len).join(' ');
      count += 1;
      tally.set(key, (tally.get(key) ?? 0) + 1);
      for (let k = 0; k < 2 * len; k++) claimed[j + k] = true;
      j += 2 * len - 1;
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
 * Counts filler words and multi-word fillers ("you know", "sort of") from the
 * user's own editable list.
 *
 * Matching is on whole tokens, never on substrings: "umbrella" is not an "um"
 * and "likely" is not a "like". Capitalisation and punctuation are already gone
 * by the time tokens get here, so "Um," "UM" and "um" are the same word.
 * Longer phrases are matched first, so the "of" in "sort of" cannot also be
 * counted by a shorter entry, and each match consumes its tokens exactly once.
 */
export function countFillers(tokens: string[], list: string[]): FillerResult {
  const tally = new Map<string, number>();
  const phrases = list
    .map(w => w.trim().toLowerCase())
    .filter(Boolean)
    .map(w => w.split(/\s+/))
    // Longest first: a three-word filler must claim its tokens before a
    // one-word entry inside it gets the chance.
    .sort((a, b) => b.length - a.length);

  // One pass per phrase over a shared "already claimed" map keeps overlapping
  // entries (e.g. "kind of" and "of course") from counting the same token twice.
  const claimed = new Array<boolean>(tokens.length).fill(false);

  for (const phrase of phrases) {
    let times = 0;
    for (let i = 0; i + phrase.length <= tokens.length; i++) {
      let match = true;
      for (let k = 0; k < phrase.length; k++) {
        if (claimed[i + k] || tokens[i + k] !== phrase[k]) { match = false; break; }
      }
      if (!match) continue;
      for (let k = 0; k < phrase.length; k++) claimed[i + k] = true;
      times++;
      i += phrase.length - 1;
    }
    if (times) {
      const key = phrase.join(' ');
      tally.set(key, (tally.get(key) ?? 0) + times);
    }
  }

  const hits = [...tally.entries()].map(([word, times]) => ({ word, times }))
    .sort((a, b) => b.times - a.times || a.word.localeCompare(b.word));
  return { count: hits.reduce((s, h) => s + h.times, 0), hits };
}

export interface SessionMetrics {
  words: number;
  /** null when the session was too short to state a pace */
  wordsPerMinute: number | null;
  pauseCount: number;
  pauseAt: number[];
  repetitionCount: number;
  repeatedTokens: Array<{ token: string; times: number }>;
  fillerCount: number;
  fillerHits: Array<{ word: string; times: number }>;
  durationMs: number;
  /** measured speaking time, reported separately — never divided into words */
  activeSpeechMs: number;
}

/** One call the UI can make once a session has finished. */
export function computeMetrics(
  transcript: string,
  events: SpeechEvent[],
  durationMs: number,
  fillerWords: string[],
  pauseThresholdMs: number = DEFAULT_PAUSE_THRESHOLD_MS
): SessionMetrics {
  const tokens = tokenize(transcript);
  // Timed events give real utterance spans, which is what lets pauses exclude
  // each phrase's own speaking time; without them the arrival gaps are all
  // there is to go on.
  const timed = hasSpanTiming(events);
  const spans = timed ? speechSpans(events) : [];
  const pauses = timed ? pausesFromSpans(spans, pauseThresholdMs) : countPauses(events, pauseThresholdMs);
  const activeSpeechMs = timed ? activeSpeechFromSpans(spans, durationMs) : Math.max(0, durationMs);
  const reps = countRepetitions(tokens);
  const fillers = countFillers(tokens, fillerWords);
  return {
    words: tokens.length,
    wordsPerMinute: wordsPerMinute(transcript, durationMs),
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
 * ("—", "--").
 *
 * The practice flow is microphone-first and no longer offers typing, but these
 * stay because they are the only way to exercise the analysis pipeline over a
 * fixed transcript in a unit test.
 */
export function countTypedPauses(text: string): PauseResult {
  const markers = /(\.{3,}|…|—|--)/g;
  const at: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = markers.exec(text)) !== null) at.push(m.index);
  return { count: at.length, at, totalPausedMs: 0 };
}

/** Metrics for a fixed transcript over a stated duration. */
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
