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
  stop: () => void;
  reset: () => void;
}

const SILENCE_PROMPT_MS = 15000;

function describe(code: string): RecognitionError {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        code,
        message:
          'Microphone access is blocked. Open the padlock in your browser’s address bar, allow the microphone for this site, then try again — or type your transcript instead.',
        recoverable: false,
      };
    case 'audio-capture':
      return {
        code,
        message: 'No microphone was found. Connect one and try again, or type your transcript instead.',
        recoverable: false,
      };
    case 'network':
      return {
        code,
        message: 'The speech service could not be reached. Check your connection, or type your transcript instead.',
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
  const failureStreak = useRef(0);
  const silenceTimer = useRef<number | null>(null);

  const clearSilenceTimer = () => {
    if (silenceTimer.current !== null) {
      clearInterval(silenceTimer.current);
      silenceTimer.current = null;
    }
  };

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
  }, []);

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
      setInterim(live);
      if (addedFinal.trim()) {
        setFinal(prev => (prev ? prev.trimEnd() + ' ' : '') + addedFinal.trim());
        setEvents(prev => [...prev, { at, text: addedFinal.trim() }]);
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
      }
    };

    rec.onend = () => {
      if (!wantsToListen.current) {
        setState(s => (s === 'error' ? s : 'stopped'));
        return;
      }
      // Spurious end — Chrome does this every ~60s. Restart, and give up only
      // if restarts keep failing immediately.
      failureStreak.current++;
      if (failureStreak.current > 5) {
        wantsToListen.current = false;
        setError({
          code: 'restart-failed',
          message: 'Speech recognition kept disconnecting. Your transcript so far is kept — you can stop and save, or type the rest.',
          recoverable: false,
        });
        setState('error');
        return;
      }
      try {
        rec.start();
        setReconnected(true);
        window.setTimeout(() => setReconnected(false), 2600);
      } catch {
        wantsToListen.current = false;
        setState('stopped');
      }
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setError(describe('aborted'));
      setState('error');
    }
  }, [lang]);

  const start = useCallback(() => {
    if (!supported) {
      setError({
        code: 'unsupported',
        message: 'Live speech recognition needs Chrome or Edge — your transcript can be typed manually instead.',
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
    spinUp();

    clearSilenceTimer();
    silenceTimer.current = window.setInterval(() => {
      if (performance.now() - lastResultAt.current > SILENCE_PROMPT_MS) setSilent(true);
    }, 2000);
  }, [supported, spinUp]);

  const stop = useCallback(() => {
    wantsToListen.current = false;
    clearSilenceTimer();
    const rec = recRef.current;
    if (rec) {
      try { rec.stop(); } catch { /* ignore */ }
    }
    setInterim('');
    setState(s => (s === 'error' ? s : 'stopped'));
  }, []);

  const reset = useCallback(() => {
    teardown();
    wantsToListen.current = false;
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
