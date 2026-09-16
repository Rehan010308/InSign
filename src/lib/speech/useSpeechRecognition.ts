import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechEvent } from './metrics';

/* The Web Speech API is not in lib.dom for every TS version — declare what we use. */
interface SRAlternative { transcript: string; confidence: number }
interface SRResult { readonly length: number; isFinal: boolean;[i: number]: SRAlternative }
interface SRResultList { readonly length: number;[i: number]: SRResult }
interface SREvent extends Event { resultIndex: number; results: SRResultList }
interface SRErrorEvent extends Event { error: string; message?: string }
interface SRInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SRConstructor = new () => SRInstance;

function getConstructor(): SRConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechRecognitionSupported = (): boolean => getConstructor() !== null;

export type RecognitionState =
  | 'idle'
  | 'requesting_permission'
  | 'listening'
  | 'stopped'
  | 'error';

export interface RecognitionError {
  code: string;
  message: string;
  /** true when the user can retry without changing browser settings */
  recoverable: boolean;
}

/** Everything a finished session needs, captured at the moment Stop settled. */
export interface FinalisedSession {
  finalTranscript: string;
  events: SpeechEvent[];
}

export interface UseSpeechRecognition {
  state: RecognitionState;
  supported: boolean;
  finalTranscript: string;
  interim: string;
  events: SpeechEvent[];
  error: RecognitionError | null;
  /** set briefly when the API dropped out and was restarted */
  reconnected: boolean;
  /** true when nothing has been heard for a while */
  silent: boolean;
  start: () => void;
  /**
   * Stops listening and resolves once the API has finished delivering results.
   * Chrome can emit one last final result *after* `stop()`; resolving on `end`
   * (with a short cap) is what keeps that last sentence in the session instead
   * of dropping it on the floor.
   */
  stop: () => Promise<FinalisedSession>;
  reset: () => void;
}

const SILENCE_PROMPT_MS = 15000;
/** How long to wait for the API's trailing results after Stop before giving up. */
const FINALISE_GRACE_MS = 1200;

function describe(code: string): RecognitionError {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        code,
        message:
          'Microphone access is blocked. Open the padlock in your browser’s address bar, allow the microphone for this site, then start again.',
        recoverable: false,
      };
    case 'audio-capture':
      return {
        code,
        message: 'No microphone was found. Connect one and start again.',
        recoverable: false,
      };
    case 'network':
      return {
        code,
        message: 'The speech service could not be reached. Check your connection and start again.',
        recoverable: true,
      };
    case 'no-speech':
      return { code, message: 'Nothing was heard yet — keep going when you are ready.', recoverable: true };
    case 'aborted':
      return { code, message: 'Recognition stopped.', recoverable: true };
    default:
      return { code, message: `Speech recognition stopped unexpectedly (${code}).`, recoverable: true };
  }
}

/**
 * Wraps webkitSpeechRecognition / SpeechRecognition in an explicit state
 * machine, restarting the API's spurious `end` events for as long as the user
 * intends to keep listening.
 */
export function useSpeechRecognition(lang = 'en-US'): UseSpeechRecognition {
  const supported = speechRecognitionSupported();
  const [state, setState] = useState<RecognitionState>('idle');
  const [finalTranscript, setFinal] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<RecognitionError | null>(null);
  const [reconnected, setReconnected] = useState(false);
  const [silent, setSilent] = useState(false);
  const [events, setEvents] = useState<SpeechEvent[]>([]);

  const recRef = useRef<SRInstance | null>(null);
  const wantsToListen = useRef(false);
  const startedAt = useRef(0);
  const lastResultAt = useRef(0);
  /**
   * Mirrors of the transcript and events that do not wait for a React render.
   * Stop reads these, so a result that lands in the same tick as Stop is still
   * part of the session it belongs to.
   */
  const finalRef = useRef('');
  const eventsRef = useRef<SpeechEvent[]>([]);
  /**
   * Where the utterance currently being recognised began, in ms since session
   * start. Set by the first result of a phrase (interim or final) and cleared
   * when that phrase is finalised, so a span measures speech rather than the
   * latency between the last word and the final result.
   */
  const segmentStart = useRef<number | null>(null);
  /**
   * Set when the service was restarted; the next utterance carries it so pause
   * detection knows the gap in front of it was a reconnection, not a silence.
   */
  const restartPending = useRef(false);
  const failureStreak = useRef(0);
  const silenceTimer = useRef<number | null>(null);
  /** Resolvers waiting for the API to finish after Stop. */
  const finaliseWaiters = useRef<Array<(s: FinalisedSession) => void>>([]);
  const finaliseTimer = useRef<number | null>(null);

  const clearSilenceTimer = () => {
    if (silenceTimer.current !== null) {
      clearInterval(silenceTimer.current);
      silenceTimer.current = null;
    }
  };

  const settleFinalise = useCallback(() => {
    if (finaliseTimer.current !== null) {
      clearTimeout(finaliseTimer.current);
      finaliseTimer.current = null;
    }
    const waiters = finaliseWaiters.current;
    finaliseWaiters.current = [];
    const snapshot: FinalisedSession = {
      finalTranscript: finalRef.current,
      events: [...eventsRef.current],
    };
    waiters.forEach(w => w(snapshot));
  }, []);

  const teardown = useCallback(() => {
    const rec = recRef.current;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onstart = null;
      try { rec.abort(); } catch { /* already dead */ }
    }
    recRef.current = null;
    clearSilenceTimer();
    settleFinalise();
  }, [settleFinalise]);

  useEffect(() => teardown, [teardown]);

  const spinUp = useCallback(() => {
    const Ctor = getConstructor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setState('listening');
      failureStreak.current = 0;
    };

    rec.onresult = (e: SREvent) => {
      const at = performance.now() - startedAt.current;
      lastResultAt.current = performance.now();
      setSilent(false);
      let addedFinal = '';
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? '';
        if (res.isFinal) addedFinal += text;
        else live += text;
      }
      // The first result of a phrase is the closest thing the Web Speech API
      // gives us to "speech started here" — everything before it is microphone
      // and service startup, which is not speaking time.
      if (segmentStart.current === null) segmentStart.current = at;
      setInterim(live);
      if (addedFinal.trim()) {
        const from = segmentStart.current ?? at;
        segmentStart.current = null;
        const afterRestart = restartPending.current;
        restartPending.current = false;
        const text = addedFinal.trim();

        finalRef.current = (finalRef.current ? finalRef.current.trimEnd() + ' ' : '') + text;
        const event: SpeechEvent = afterRestart
          ? { at, startedAt: from, text, afterRestart: true }
          : { at, startedAt: from, text };
        eventsRef.current = [...eventsRef.current, event];

        setFinal(finalRef.current);
        setEvents(eventsRef.current);
      }
    };

    rec.onerror = (e: SRErrorEvent) => {
      const err = describe(e.error);
      if (e.error === 'no-speech') {
        // Not fatal: the API fires this during a long silence.
        setSilent(true);
        return;
      }
      if (e.error === 'aborted' && wantsToListen.current) return;
      setError(err);
      if (!err.recoverable) {
        wantsToListen.current = false;
        setState('error');
        settleFinalise();
      }
    };

    rec.onend = () => {
      if (!wantsToListen.current) {
        setState(s => (s === 'error' ? s : 'stopped'));
        // Everything the API had to say has now been said.
        settleFinalise();
        return;
      }
      // Spurious end — Chrome does this every ~60s. Restart, and give up only
      // if restarts keep failing immediately.
      failureStreak.current++;
      if (failureStreak.current > 5) {
        wantsToListen.current = false;
        setError({
          code: 'restart-failed',
          message: 'Speech recognition kept disconnecting. Everything heard so far is kept — stop to see your results.',
          recoverable: false,
        });
        setState('error');
        settleFinalise();
        return;
      }
      try {
        // A restart discards whatever phrase was in flight; the gap it opens is
        // reconnection, not speech, so the next phrase starts its own span and
        // is marked so the silence in front of it is not counted as a pause.
        segmentStart.current = null;
        restartPending.current = true;
        rec.start();
        setReconnected(true);
        window.setTimeout(() => setReconnected(false), 2600);
      } catch {
        wantsToListen.current = false;
        setState('stopped');
        settleFinalise();
      }
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setError(describe('aborted'));
      setState('error');
    }
  }, [lang, settleFinalise]);

  const start = useCallback(() => {
    if (!supported) {
      setError({
        code: 'unsupported',
        message: 'Live practice needs Chrome or Edge — this browser has no speech recognition.',
        recoverable: false,
      });
      setState('error');
      return;
    }
    setError(null);
    setSilent(false);
    setState('requesting_permission');
    wantsToListen.current = true;
    startedAt.current = performance.now();
    lastResultAt.current = performance.now();
    segmentStart.current = null;
    restartPending.current = false;
    finalRef.current = '';
    eventsRef.current = [];
    setFinal('');
    setInterim('');
    setEvents([]);
    spinUp();

    clearSilenceTimer();
    silenceTimer.current = window.setInterval(() => {
      if (performance.now() - lastResultAt.current > SILENCE_PROMPT_MS) setSilent(true);
    }, 2000);
  }, [supported, spinUp]);

  const stop = useCallback((): Promise<FinalisedSession> => {
    wantsToListen.current = false;
    segmentStart.current = null;
    clearSilenceTimer();
    setInterim('');

    const rec = recRef.current;
    if (!rec) {
      setState(s => (s === 'error' ? s : 'stopped'));
      return Promise.resolve({ finalTranscript: finalRef.current, events: [...eventsRef.current] });
    }

    const promise = new Promise<FinalisedSession>(resolve => {
      finaliseWaiters.current.push(resolve);
    });
    // `stop()` asks the API to finish the phrase in flight and deliver it; the
    // timer is only there so a service that never fires `end` cannot hang the
    // results screen.
    if (finaliseTimer.current === null) {
      finaliseTimer.current = window.setTimeout(settleFinalise, FINALISE_GRACE_MS);
    }
    try { rec.stop(); } catch { settleFinalise(); }
    setState(s => (s === 'error' ? s : 'stopped'));
    return promise;
  }, [settleFinalise]);

  const reset = useCallback(() => {
    teardown();
    wantsToListen.current = false;
    segmentStart.current = null;
    restartPending.current = false;
    finalRef.current = '';
    eventsRef.current = [];
    setFinal('');
    setInterim('');
    setEvents([]);
    setError(null);
    setSilent(false);
    setReconnected(false);
    setState('idle');
  }, [teardown]);

  return {
    state, supported, finalTranscript, interim, events, error, reconnected, silent,
    start, stop, reset,
  };
}
