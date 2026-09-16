import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ScenarioPicker from '../features/speech/ScenarioPicker';
import LiveTranscript from '../features/speech/LiveTranscript';
import MetricTiles from '../features/speech/MetricTiles';
import { useSpeechRecognition } from '../lib/speech/useSpeechRecognition';
import {
  computeMetrics, metricsFromTypedTranscript, type SessionMetrics,
} from '../lib/speech/metrics';
import { useAuth } from '../services/authService';
import {
  getPreferences, listSpeechSessions, saveSpeechSession, setOpenRecommendation, upsertPattern,
} from '../services/sessionService';
import { detectPattern } from '../services/personalizationEngine';
import {
  DEFAULT_FILLER_WORDS, SCENARIOS, SCENARIO_LABELS, type Scenario, type UserPreferences,
} from '../types';

type Phase = 'pick' | 'practice' | 'review';
type Mode = 'mic' | 'manual';

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function SpeechPractice() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const recog = useSpeechRecognition();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [mode, setMode] = useState<Mode>(recog.supported ? 'mic' : 'manual');
  const [scenario, setScenario] = useState<Scenario | null>(() => {
    const q = params.get('scenario');
    return SCENARIOS.includes(q as Scenario) ? (q as Scenario) : null;
  });

  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const tick = useRef<number | null>(null);

  const [manualText, setManualText] = useState('');
  const [manualSeconds, setManualSeconds] = useState(60);
  const [reviewMetrics, setReviewMetrics] = useState<SessionMetrics | null>(null);
  const [reviewTranscript, setReviewTranscript] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const fillerWords = prefs?.filler_words ?? DEFAULT_FILLER_WORDS;

  useEffect(() => {
    if (!user) return;
    let alive = true;
    getPreferences(user.id).then(p => { if (alive) setPrefs(p); });
    return () => { alive = false; };
  }, [user]);

  // Release the microphone if the user navigates away mid-session.
  useEffect(() => () => {
    recog.stop();
    if (tick.current !== null) clearInterval(tick.current);
  }, [recog]);

  const liveMetrics = useMemo(
    () => computeMetrics(recog.finalTranscript, recog.events, elapsed || 1, fillerWords),
    [recog.finalTranscript, recog.events, elapsed, fillerWords]
  );

  const startTimer = useCallback(() => {
    startedAt.current = performance.now();
    setElapsed(0);
    if (tick.current !== null) clearInterval(tick.current);
    tick.current = window.setInterval(() => {
      setElapsed(performance.now() - startedAt.current);
    }, 200);
  }, []);

  const stopTimer = useCallback(() => {
    if (tick.current !== null) { clearInterval(tick.current); tick.current = null; }
    return performance.now() - startedAt.current;
  }, []);

  function beginSession() {
    setSaveError(null);
    recog.reset();
    startTimer();
    setPhase('practice');
    if (mode === 'mic') recog.start();
  }

  function stopSession() {
    const duration = stopTimer();
    if (mode === 'mic') {
      recog.stop();
      const metrics = computeMetrics(recog.finalTranscript, recog.events, duration, fillerWords);
      setReviewMetrics(metrics);
      setReviewTranscript(recog.finalTranscript.trim());
    } else {
      const ms = Math.max(1000, manualSeconds * 1000);
      setReviewMetrics(metricsFromTypedTranscript(manualText, ms, fillerWords));
      setReviewTranscript(manualText.trim());
    }
    setPhase('review');
  }

  function cancelSession() {
    stopTimer();
    recog.stop();
    recog.reset();
    setManualText('');
    setElapsed(0);
    setPhase('pick');
  }

  async function save() {
    if (!user || !scenario || !reviewMetrics) return;
    if (!reviewTranscript.trim()) {
      setSaveError('There is nothing to save yet — record or type a transcript first.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const storeTranscripts = prefs?.store_transcripts ?? true;
      await saveSpeechSession(user.id, {
        scenario,
        transcript: storeTranscripts ? reviewTranscript : null,
        duration_ms: reviewMetrics.durationMs,
        words_per_minute: reviewMetrics.wordsPerMinute,
        pause_count: reviewMetrics.pauseCount,
        repetition_count: reviewMetrics.repetitionCount,
        filler_count: reviewMetrics.fillerCount,
      });

      // Re-run personalization over the real history, including this session.
      const history = await listSpeechSessions(user.id);
      const result = detectPattern(history);
      if (result.pattern) {
        const pattern = await upsertPattern(user.id, {
          pattern_key: result.pattern,
          scenario: result.scenario,
          confidence: result.confidence,
          evidence: result.evidence,
        });
        await setOpenRecommendation(user.id, {
          recommendation: result.recommendation,
          scenario: result.scenario,
          source_pattern_id: pattern.id,
        });
      } else {
        await setOpenRecommendation(user.id, {
          recommendation: result.recommendation,
          scenario: null,
          source_pattern_id: null,
        });
      }
      navigate('/app/speech/history?saved=1');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'The session could not be saved. Try again.');
      setSaving(false);
    }
  }

  /* ----------------------------------------------------------- rendering */

  if (phase === 'pick') {
    return (
      <div className="wrap stack-lg">
        <header>
          <p className="overline">SPEECH COMPANION</p>
          <h1 className="statement-sm">What are you practising <em className="serif">today</em>?</h1>
          <p className="app-hint">
            Pick a scenario. InSign observes how you speak — pace, pauses, repetitions, fillers —
            and remembers the shape of it, not a score.
          </p>
        </header>

        <ScenarioPicker value={scenario} onChange={setScenario} />

        {!recog.supported && (
          <div className="notice" role="status">
            <strong>Live speech recognition needs Chrome or Edge.</strong> In this browser you can still
            run the full pipeline by typing your transcript — the metrics are computed exactly the same way.
          </div>
        )}

        <div className="panel">
          <div className="panel-head"><h3>How you want to practise</h3></div>
          <div className="row">
            <button
              type="button"
              className={mode === 'mic' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              onClick={() => setMode('mic')}
              disabled={!recog.supported}
              aria-pressed={mode === 'mic'}
            >
              Speak out loud
            </button>
            <button
              type="button"
              className={mode === 'manual' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              onClick={() => setMode('manual')}
              aria-pressed={mode === 'manual'}
            >
              Type my transcript
            </button>
          </div>

          <button
            type="button"
            className="link-btn micro"
            style={{ marginTop: 18 }}
            aria-expanded={showPrivacy}
            onClick={() => setShowPrivacy(v => !v)}
          >
            HOW SPEECH IS PROCESSED
          </button>
          {showPrivacy && (
            <div className="notice" style={{ marginTop: 12 }}>
              Browser speech recognition may send your audio to your browser vendor's service —
              that part is not local, and we will not pretend otherwise. Everything after the
              transcript (pace, pauses, repetitions, fillers, pattern detection and the practice
              recommendation) runs locally in this page. Nothing is stored until you press Save,
              and your transcript is only kept if "store transcripts" is on in Settings.
            </div>
          )}
        </div>

        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!scenario}
            onClick={beginSession}
            data-testid="begin-session"
          >
            {scenario ? `Start ${SCENARIO_LABELS[scenario].toLowerCase()} practice` : 'Choose a scenario first'}
            <span className="arrow">→</span>
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'practice') {
    const listening = recog.state === 'listening';
    return (
      <div className="wrap stack-lg">
        <header className="section-head">
          <div>
            <p className="overline">{SCENARIO_LABELS[scenario!].toUpperCase()} PRACTICE</p>
            <h1 className="statement-sm">Take your time.</h1>
          </div>
          <p className="timer" data-testid="timer" aria-label="Elapsed time">{formatClock(elapsed)}</p>
        </header>

        <div className="practice-stage">
          <div className="practice-controls">
            <div className={`mic-orb${listening ? ' live' : ''}`} aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5" /></svg>
            </div>
            <span className={`state-chip${listening ? ' live' : recog.error ? ' warn' : ''}`} role="status" data-testid="speech-state">
              <i />
              {mode === 'manual'
                ? 'TYPED TRANSCRIPT'
                : recog.state === 'requesting_permission' ? 'ASKING FOR THE MICROPHONE'
                : recog.state === 'listening' ? 'LISTENING'
                : recog.state === 'error' ? 'STOPPED'
                : 'READY'}
            </span>
            {recog.reconnected && (
              <span className="state-chip" role="status"><i />RECONNECTED</span>
            )}
            {recog.silent && listening && (
              <span className="state-chip warn" role="status"><i />NOTHING HEARD YET — STILL LISTENING</span>
            )}
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={stopSession} data-testid="stop-session">
                Stop
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cancelSession}>
                Cancel
              </button>
            </div>
          </div>

          <div>
            {mode === 'mic' ? (
              <>
                <LiveTranscript final={recog.finalTranscript} interim={recog.interim} listening={listening} />
                {recog.error && (
                  <div className="notice" style={{ marginTop: 14 }} role="alert">
                    {recog.error.message}
                    {!recog.error.recoverable && (
                      <>
                        {' '}
                        <button type="button" className="link-btn micro" onClick={() => setMode('manual')}>
                          SWITCH TO TYPED TRANSCRIPT
                        </button>
                      </>
                    )}
                  </div>
                )}
                <MetricTiles metrics={liveMetrics} />
              </>
            ) : (
              <>
                <label className="field">
                  <span className="field-label">YOUR TRANSCRIPT</span>
                  <textarea
                    value={manualText}
                    onChange={e => setManualText(e.target.value)}
                    placeholder="Type what you said. Mark a pause with … or —."
                    data-testid="manual-transcript"
                  />
                  <span className="field-hint micro">
                    PAUSES ARE COUNTED FROM THE MARKS YOU TYPE (… OR —), SINCE TYPED TEXT CARRIES NO AUDIO TIMING
                  </span>
                </label>
                <label className="field" style={{ maxWidth: 240 }}>
                  <span className="field-label">HOW LONG DID IT TAKE? (SECONDS)</span>
                  <input
                    type="number"
                    min={1}
                    value={manualSeconds}
                    onChange={e => setManualSeconds(Math.max(1, Number(e.target.value) || 1))}
                    data-testid="manual-seconds"
                  />
                </label>
                <MetricTiles
                  metrics={metricsFromTypedTranscript(manualText, Math.max(1000, manualSeconds * 1000), fillerWords)}
                />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* review */
  const m = reviewMetrics!;
  const storeTranscripts = prefs?.store_transcripts ?? true;
  return (
    <div className="wrap stack-lg">
      <header>
        <p className="overline">REVIEW · {SCENARIO_LABELS[scenario!].toUpperCase()}</p>
        <h1 className="statement-sm">Here's what that <em className="serif">looked</em> like.</h1>
        <p className="app-hint">
          Observations from {formatClock(m.durationMs)} of practice. Nothing is stored until you save.
        </p>
      </header>

      <MetricTiles metrics={m} />

      <div className="panel">
        <div className="panel-head"><h3>Transcript</h3></div>
        {reviewTranscript ? (
          <p style={{ fontSize: 16, lineHeight: 1.85 }} data-testid="review-transcript">{reviewTranscript}</p>
        ) : (
          <p className="empty-state">Nothing was captured. Try again, or type the transcript instead.</p>
        )}
        {!storeTranscripts && (
          <p className="micro" style={{ marginTop: 14 }}>
            STORE TRANSCRIPTS IS OFF — THE METRICS WILL BE SAVED, THE TRANSCRIPT WILL NOT
          </p>
        )}
      </div>

      {saveError && <p className="form-error" role="alert">{saveError}</p>}

      <div className="row">
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving} data-testid="save-session">
          {saving ? 'Saving…' : 'Save this session'} <span className="arrow">→</span>
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => { setPhase('pick'); recog.reset(); setManualText(''); }}>
          Discard
        </button>
      </div>
    </div>
  );
}
