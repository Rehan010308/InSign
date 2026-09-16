import { describe, expect, it } from 'vitest';
import {
  computeMetrics, countFillers, countPauses, countRepetitions, countTypedPauses,
  metricsFromTypedTranscript, tokenize, wordsPerMinute,
} from '../../src/lib/speech/metrics';
import { DEFAULT_FILLER_WORDS } from '../../src/types';

describe('tokenize', () => {
  it('lowercases, strips punctuation and keeps apostrophes', () => {
    expect(tokenize("Hello, there! I'm here.")).toEqual(['hello', 'there', "i'm", 'here']);
  });

  it('returns nothing for an empty transcript', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('wordsPerMinute', () => {
  it('computes words over active speaking time', () => {
    // 20 words in 30 seconds = 40 wpm
    const text = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
    expect(wordsPerMinute(text, 30_000)).toBe(40);
  });

  it('is zero when nothing was said', () => {
    expect(wordsPerMinute('', 30_000)).toBe(0);
    expect(wordsPerMinute('hello', 0)).toBeNull();
  });
});

describe('countPauses', () => {
  it('counts gaps between recognition results above the threshold', () => {
    const events = [{ at: 0 }, { at: 500 }, { at: 2000 }, { at: 2300 }, { at: 4000 }];
    const result = countPauses(events, 800);
    expect(result.count).toBe(2);
    expect(result.at).toEqual([500, 2300]);
    expect(result.totalPausedMs).toBe(1500 + 1700);
  });

  it('counts nothing for a single result', () => {
    expect(countPauses([{ at: 0 }]).count).toBe(0);
  });

  it('respects a custom threshold', () => {
    const events = [{ at: 0 }, { at: 900 }];
    expect(countPauses(events, 800).count).toBe(1);
    expect(countPauses(events, 1000).count).toBe(0);
  });
});

describe('countRepetitions', () => {
  it('counts each extra occurrence in an immediate run', () => {
    const r = countRepetitions(tokenize('I I I think so'));
    expect(r.count).toBe(2);
    expect(r.tokens[0]).toEqual({ token: 'i', times: 2 });
  });

  it('counts repeated bigrams', () => {
    const r = countRepetitions(tokenize('can you can you hear me'));
    expect(r.count).toBe(1);
    expect(r.tokens[0]).toEqual({ token: 'can you', times: 1 });
  });

  it('finds nothing in clean speech', () => {
    expect(countRepetitions(tokenize('this sentence repeats nothing at all')).count).toBe(0);
  });
});

describe('countFillers', () => {
  it('counts single-word and multi-word fillers from the user list', () => {
    const tokens = tokenize('um so you know I was like, um, basically done');
    const r = countFillers(tokens, DEFAULT_FILLER_WORDS);
    expect(r.count).toBe(5); // um ×2, you know, like, basically
    expect(r.hits.find(h => h.word === 'um')?.times).toBe(2);
    expect(r.hits.find(h => h.word === 'you know')?.times).toBe(1);
  });

  it('honours a custom list and ignores the defaults', () => {
    const r = countFillers(tokenize('um sort of maybe'), ['sort of']);
    expect(r.count).toBe(1);
    expect(r.hits).toEqual([{ word: 'sort of', times: 1 }]);
  });

  it('ignores blank entries in the list', () => {
    expect(countFillers(tokenize('hello there'), ['', '   ']).count).toBe(0);
  });
});

describe('filler detection', () => {
  it('counts every supported filler in the default list', () => {
    const text = 'um uh hmm like basically actually you know sort of kind of I mean';
    const r = countFillers(tokenize(text), DEFAULT_FILLER_WORDS);
    expect(r.count).toBe(10);
  });

  it('is unaffected by capitalisation and punctuation', () => {
    const r = countFillers(tokenize('Um, UH... Like! You know? Sort-of.'), DEFAULT_FILLER_WORDS);
    // "sort-of" splits on the hyphen, so it is the phrase "sort of".
    expect(r.count).toBe(5);
  });

  it('never matches a filler inside a longer word', () => {
    const text = 'the umbrella likely broke, basicallyx umm hmmm actuality';
    expect(countFillers(tokenize(text), DEFAULT_FILLER_WORDS).count).toBe(0);
  });

  it('matches a multi-word filler only as the whole phrase', () => {
    // "you" and "know" alone are not fillers, and neither is "sort" alone.
    expect(countFillers(tokenize('you should know the sort of the thing'), DEFAULT_FILLER_WORDS).count)
      .toBe(1); // only "sort of"
    expect(countFillers(tokenize('do you know it'), DEFAULT_FILLER_WORDS).count).toBe(1);
  });

  it('does not let two overlapping entries claim the same word', () => {
    // "kind of" wins the "of"; nothing else may count it a second time.
    const r = countFillers(tokenize('it was kind of of course fine'), ['kind of', 'of course']);
    expect(r.count).toBe(2);
    expect(r.hits.map(h => h.word).sort()).toEqual(['kind of', 'of course']);
  });
});

describe('repetition detection', () => {
  it('counts repeated words regardless of capitalisation and punctuation', () => {
    expect(countRepetitions(tokenize('Well, well well — that happened')).count).toBe(2);
    expect(countRepetitions(tokenize('I. I. I. think')).count).toBe(2);
  });

  it('counts a repeated phrase once', () => {
    expect(countRepetitions(tokenize('what I mean what I mean is this')).count).toBe(1);
  });

  it('does not count a word that simply appears twice apart', () => {
    expect(countRepetitions(tokenize('the cat sat on the mat')).count).toBe(0);
  });
});

describe('computeMetrics', () => {
  it('produces the full observation set from a transcript and its timing', () => {
    const transcript = 'um I I think that that we should um go now';
    const events = [{ at: 0 }, { at: 2000 }, { at: 2200 }, { at: 6000 }];
    const m = computeMetrics(transcript, events, 12_000, DEFAULT_FILLER_WORDS);

    expect(m.words).toBe(11);
    expect(m.pauseCount).toBe(2);
    expect(m.repetitionCount).toBe(2); // "I I" and "that that"
    expect(m.fillerCount).toBe(2); // two "um"
    // These events carry no utterance starts, so there is no measured speaking
    // duration to divide by: the whole session is used rather than the leftover
    // of subtracting arrival gaps, which is not a duration at all.
    expect(m.activeSpeechMs).toBe(12_000);
    expect(m.wordsPerMinute).toBe(55);
  });
});

describe('typed transcripts', () => {
  it('counts only the pause marks the writer typed', () => {
    expect(countTypedPauses('I was thinking... and then — well, that.').count).toBe(2);
    expect(countTypedPauses('No pauses here at all.').count).toBe(0);
  });

  it('computes exactly the same metrics from typed text and a stated duration', () => {
    const text = 'um I I think... we should basically you know go -- now';
    const m = metricsFromTypedTranscript(text, 60_000, DEFAULT_FILLER_WORDS);

    expect(m.words).toBe(11);
    expect(m.wordsPerMinute).toBe(11);
    expect(m.pauseCount).toBe(2); // "..." and "--"
    expect(m.repetitionCount).toBe(1); // "I I"
    expect(m.fillerCount).toBe(3); // um, basically, you know
  });
});
