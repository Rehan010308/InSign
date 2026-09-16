import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ScenarioPicker from '../features/speech/ScenarioPicker';
import PracticePrompt from '../features/speech/PracticePrompt';
import ListeningStage from '../features/speech/ListeningStage';
import SessionResults from '../features/speech/SessionResults';
import { useSpeechRecognition } from '../lib/speech/useSpeechRecognition';
import { useMicLevel } from '../lib/speech/useMicLevel';
import { computeMetrics, type SessionMetrics } from '../lib/speech/metrics';
import {
  customQuestion, selectQuestion, SESSION_LENGTH, type PracticeQuestion,
} from '../lib/speech/questionBank';
import {
  compareToTargets, drillFor, focusFor, generateTargets, numbersFromMetrics, observations,
  recommendationSentence, scenarioProfile, SKILL_FOR_FOCUS,
  type Drill, type Observation, type SessionNumbers, type Target, type TargetComparison,
} from '../lib/speech/coach';
import { useAuth } from '../services/authService';
import {
  getPreferences, listSpeechSessions, saveSpeechSession, setOpenRecommendation, upsertPattern,
} from '../services/sessionService';
import { detectPattern } from '../services/personalizationEngine';
import {
  DEFAULT_FILLER_WORDS, SCENARIOS, SCENARIO_LABELS,
  type Scenario, type SpeechSession, type UserPreferences,
} from '../types';

type Phase = 'pick' | 'prepare' | 'listening' | 'processing' | 'results';

/** What the current attempt is working towards, carried across Practice Again. */
interface Brief {
  targets: Target[];
  drill: Drill;
  /** the attempt these targets were set from, for the before → after comparison */
  before: SessionNumbers;
}

interface Result {
  metrics: SessionMetrics;
  transcript: string;
  targets: Target[];
  drill: Drill;
  comparison: TargetComparison[] | null;
  notes: Observation[];
}

export default function SpeechPractice() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const recog = useSpeechRecognition();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [history, setHistory] = useState<SpeechSession[]>([]);
  const [phase, setPhase] = useState<Phase>('pick');

  const [scenario, setScenario] = useState<Scenario | null>(() => {
    const q = params.get('scenario');
    return SCENARIOS.includes(q as Scenario) ? (q as Scenario) : null;
  });
  const [customText, setCustomText] = useState('');
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  /** questions already answered in this sitting, so they do not come back */
  const [asked, setAsked] = useState<string[]>([]);
  const [repeatAttempt, setRepeatAttempt] = useState(false);

  const [brief, setBrief] = useState<Brief | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  /** performance.now() at Start; the single source of the session's duration. */
  const sessionStart = useRef(0);
  /** guards against saving the same finished session twice */
  const savedThisSession = useRef(false);

  const fillerWords = prefs?.filler_words ?? DEFAULT_FILLER_WORDS;
  const listening = phase === 'listening';
  const mic = useMicLevel(listening);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    getPreferences(user.id).then(p => { if (alive) setPrefs(p); });
    listSpeechSessions(user.id).then(h => { if (alive) setHistory(h); });
    return () => { alive = false; };
  }, [user]);

  // Release the microphone if the user navigates away mid-session.
  const stopRecognition = recog.stop;
  useEffect(() => () => { void stopRecognition(); }, [stopRecognition]);

  /** This scenario's own history — never mixed with the other scenarios. */
  const profile = useMemo(
    () => scenarioProfile(history, scenario ?? 'interview'),
    [history, scenario]
  );

  const sessionLength = scenario ? SESSION_LENGTH[scenario] : 1;

  /* ------------------------------------------------------------ question */

  const pickQuestion = useCallback(
    (forScenario: Scenario, index: number, avoid: string[]): PracticeQuestion | null => {
      if (forScenario === 'custom') return customQuestion(customText);
      const scoped = scenarioProfile(history, forScenario);
      return selectQuestion({
        scenario: forScenario,
        sessionCount: scoped.count,
        index,
        // A recurring weakness steers which question comes up: the bank is
        // ordered so prompts that exercise that skill come first.
        preferSkill: scoped.focus ? SKILL_FOR_FOCUS[scoped.focus] : null,
        avoidIds: avoid,
      });
    },
    [history, customText]
  );

  function beginScenario() {
    if (!scenario) return;
    const q = pickQuestion(scenario, 0, []);
    if (!q) return;
    setQuestion(q);
    setQuestionIndex(0);
    setAsked([]);
    setBrief(null);
    setResult(null);
    setRepeatAttempt(false);
    setSaveError(null);
    setPhase('prepare');
  }

  function anotherQuestion() {
    if (!scenario || !question) return;
    const avoid = [question.id, ...asked];
    const q = pickQuestion(scenario, questionIndex + 1, avoid);
    if (q) setQuestion(q);
  }

  /* ------------------------------------------------------------- session */

  function startPractice() {
    setSaveError(null);
    savedThisSession.current = false;
    setResult(null);
    sessionStart.current = performance.now();
    setPhase('listening');
    recog.start();
  }

  async function stopPractice() {
    if (!scenario || !question) return;
    setPhase('processing');
    // The wall clock from Start to Stop is the session's duration. Nothing a
    // recognition restart does can touch it, which is why the pace derived from
    // it can no longer collapse to a fraction of a second.
    const durationMs = performance.now() - sessionStart.current;
    // Chrome can deliver one last final result after `stop()`; waiting for the
    // API to settle is what keeps that sentence in the session.
    const finalised = await recog.stop();

    const metrics = computeMetrics(
      finalised.finalTranscript, finalised.events, durationMs, fillerWords
    );
    const now = numbersFromMetrics(metrics);
    const label = SCENARIO_LABELS[scenario];

    // Targets and drill for the *next* attempt come from what just happened,
    // aimed at the focus this scenario's stored history points to.
    const focus = focusFor(profile, now);
    const targets = generateTargets(now, profile.focus);
    const drill = drillFor(focus, profile, question.durationTarget);
    const comparison = brief ? compareToTargets(brief.before, now, brief.targets) : null;

    setResult({
      metrics,
      transcript: finalised.finalTranscript.trim(),
      targets,
      drill,
      comparison,
      notes: observations(now, profile, targets, label.toLowerCase()),
    });
    setPhase('results');
  }

  function cancelPractice() {
    void recog.stop();
    recog.reset();
    setPhase('prepare');
  }

  /* ---------------------------------------------------------------- save */

  /** Writes the finished session, then re-reads history so the next screen sees it. */
  const persist = useCallback(async (): Promise<boolean> => {
    if (!user || !scenario || !result) return false;
    if (savedThisSession.current) return true;
    if (!result.transcript) {
      setSaveError('Nothing was heard, so there is nothing to keep. Try the question again.');
      return false;
    }

    setBusy(true);
    setSaveError(null);
    try {
      const storeTranscripts = prefs?.store_transcripts ?? true;
      await saveSpeechSession(user.id, {
        scenario,
        transcript: storeTranscripts ? result.transcript : null,
        duration_ms: result.metrics.durationMs,
        // 0 means the session was too short to state a pace; it is stored as
        // zero rather than as an invented number, and read back as "no pace".
        words_per_minute: result.metrics.wordsPerMinute ?? 0,
        pause_count: result.metrics.pauseCount,
        repetition_count: result.metrics.repetitionCount,
        filler_count: result.metrics.fillerCount,
      });
      savedThisSession.current = true;

      const fresh = await listSpeechSessions(user.id);
      setHistory(fresh);

      // Cross-scenario pattern detection is unchanged; the open recommendation
      // is now the scenario's own target, so the dashboard says what this screen
      // said.
      const detected = detectPattern(fresh);
      if (detected.pattern) {
        await upsertPattern(user.id, {
          pattern_key: detected.pattern,
          scenario: detected.scenario,
          confidence: detected.confidence,
          evidence: detected.evidence,
        });
      }
      const updated = scenarioProfile(fresh, scenario);
      await setOpenRecommendation(user.id, {
        recommendation: recommendationSentence(
          updated, result.targets, result.drill, SCENARIO_LABELS[scenario].toLowerCase()
        ),
        scenario,
        source_pattern_id: null,
      });
      setBusy(false);
      return true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'The session could not be saved. Try again.');
      setBusy(false);
      return false;
    }
  }, [user, scenario, result, prefs]);

  /* ------------------------------------------------------- results actions */

  async function practiceAgain() {
    if (!result) return;
    if (!(await persist())) return;
    // Same scenario, same question, the target and drill just set: the user
    // should land back on the prepare screen with nothing to reconfigure.
    setBrief({
      targets: result.targets,
      drill: result.drill,
      before: numbersFromMetrics(result.metrics),
    });
    setRepeatAttempt(true);
    setResult(null);
    recog.reset();
    setPhase('prepare');
  }

  async function nextQuestion() {
    if (!scenario || !question || !result) return;
    if (!(await persist())) return;
    const nextIndex = questionIndex + 1;
    const avoid = [question.id, ...asked];
    const q = pickQuestion(scenario, nextIndex, avoid);
    setAsked(avoid);
    setQuestionIndex(nextIndex);
    if (q) setQuestion(q);
    setBrief(null);
    setRepeatAttempt(false);
    setResult(null);
    recog.reset();
    setPhase('prepare');
  }

  async function finish() {
    if (!(await persist())) return;
    navigate('/app/speech/history?saved=1');
  }

  function discard() {
    setResult(null);
    setBrief(null);
    setRepeatAttempt(false);
    recog.reset();
    setPhase('prepare');
  }

  /* ----------------------------------------------------------- rendering */

  if (phase === 'pick' || !scenario || !question) {
    const customReady = scenario !== 'custom' || customQuestion(customText) !== null;
    return (
      <div className="wrap stack-lg">
        <header>
          <p className="overline">SPEECH COMPANION</p>
          <h1 className="statement-sm">What are you practising <em className="serif">today</em>?</h1>
          <p className="app-hint">
            Pick a situation and InSign gives you something real to answer. It listens to how you
            speak — pace, pauses, repetitions, fillers — then sets one measurable target for the
            next attempt.
          </p>
        </header>

        <ScenarioPicker value={scenario} onChange={setScenario} />

        {scenario === 'custom' && (
          <div className="panel">
            <div className="panel-head"><h3>What would you like to practise?</h3></div>
            <label className="field">
              <span className="field-label">DESCRIBE YOUR SITUATION</span>
              <textarea
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                placeholder="e.g. I have to explain my robotics project to a professor."
                data-testid="custom-situation"
                style={{ minHeight: 96 }}
              />
              <span className="field-hint micro">
                YOUR WORDS BECOME THE PROMPT · NOTHING IS SENT ANYWHERE TO WRITE IT
              </span>
            </label>
          </div>
        )}

        {!recog.supported && (
          <div className="notice" role="status">
            <strong>Live practice needs Chrome or Edge.</strong> This browser has no speech
            recognition, so the microphone cannot be transcribed here.
          </div>
        )}

        <div className="panel">
          <button
            type="button"
            className="link-btn micro"
            aria-expanded={showPrivacy}
            onClick={() => setShowPrivacy(v => !v)}
          >
            HOW SPEECH IS PROCESSED
          </button>
          {showPrivacy && (
            <div className="notice" style={{ marginTop: 12 }}>
              Browser speech recognition may send your audio to your browser vendor's service —
              that part is not local, and we will not pretend otherwise. Everything after the
              transcript (pace, pauses, repetitions, fillers, your targets and your drills) is
              computed in this page. Your transcript is only kept if "store transcripts" is on in
              Settings.
            </div>
          )}
        </div>

        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!scenario || !customReady}
            onClick={beginScenario}
            data-testid="begin-session"
          >
            {scenario
              ? `Start ${SCENARIO_LABELS[scenario].toLowerCase()} practice`
              : 'Choose a scenario first'}
            <span className="arrow">→</span>
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'prepare') {
    return (
      <div className="wrap practice-shell">
        <PracticePrompt
          scenario={scenario}
          question={question}
          index={questionIndex}
          total={sessionLength}
          targets={brief?.targets ?? []}
          drill={brief?.drill ?? null}
          repeat={repeatAttempt}
          onStart={startPractice}
          onSkip={scenario === 'custom' ? undefined : anotherQuestion}
          startLabel={repeatAttempt ? 'Start this attempt' : 'Start practice'}
          disabled={!recog.supported}
        />
        <button type="button" className="link-btn micro back-link" onClick={() => setPhase('pick')}>
          ← CHOOSE A DIFFERENT SCENARIO
        </button>
      </div>
    );
  }

  if (phase === 'listening' || phase === 'processing') {
    return (
      <div className="wrap practice-shell">
        <ListeningStage
          question={question}
          phase={phase === 'processing' ? 'processing' : 'listening'}
          recognitionState={recog.state}
          error={recog.error}
          reconnected={recog.reconnected}
          silent={recog.silent}
          level={mic.level}
          startedAt={sessionStart.current}
          finalTranscript={recog.finalTranscript}
          interim={recog.interim}
          onStop={() => { void stopPractice(); }}
          onCancel={cancelPractice}
        />
      </div>
    );
  }

  const r = result!;
  return (
    <div className="wrap practice-shell">
      <SessionResults
        question={question}
        scenarioLabel={SCENARIO_LABELS[scenario]}
        metrics={r.metrics}
        profile={profile}
        targets={r.targets}
        drill={r.drill}
        comparison={r.comparison}
        observations={r.notes}
        saveError={saveError}
        busy={busy}
        onPracticeAgain={() => { void practiceAgain(); }}
        onNextQuestion={
          scenario === 'custom' || questionIndex + 1 >= sessionLength
            ? null
            : () => { void nextQuestion(); }
        }
        onFinish={() => { void finish(); }}
        onDiscard={discard}
      />
    </div>
  );
}
