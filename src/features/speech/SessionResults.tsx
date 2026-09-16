import type { SessionMetrics } from '../../lib/speech/metrics';
import type { PracticeQuestion } from '../../lib/speech/questionBank';
import {
  FOCUS_LABELS, FOCUS_ORDER, MIN_SESSIONS_FOR_PATTERN, TREND_COPY,
  type Drill, type ScenarioProfile, type Target, type TargetComparison,
} from '../../lib/speech/coach';
import { formatClock } from './PracticeTimer';

const STATUS_COPY: Record<TargetComparison['status'], string> = {
  reached: 'TARGET REACHED',
  almost: 'ALMOST THERE',
  keep: 'KEEP PRACTISING',
};

/** The four measured numbers, revealed in order rather than all at once. */
function Headline({ metrics }: { metrics: SessionMetrics }) {
  const cells = [
    {
      key: 'wpm',
      label: 'PACE',
      value: metrics.wordsPerMinute === null ? '—' : String(Math.round(metrics.wordsPerMinute)),
      unit: metrics.wordsPerMinute === null ? 'TOO SHORT TO MEASURE' : `WPM · ${metrics.words} WORDS`,
      testId: 'metric-wpm',
    },
    { key: 'pauses', label: 'PAUSES', value: String(metrics.pauseCount), unit: 'BETWEEN PHRASES', testId: 'metric-pauses' },
    { key: 'fillers', label: 'FILLERS', value: String(metrics.fillerCount), unit: fillerUnit(metrics), testId: 'metric-fillers' },
    { key: 'reps', label: 'REPETITIONS', value: String(metrics.repetitionCount), unit: repeatUnit(metrics), testId: 'metric-repetitions' },
  ];

  return (
    <div className="result-headline" data-testid="metric-tiles">
      {cells.map((c, i) => (
        <div className="result-metric reveal" key={c.key} style={{ animationDelay: `${i * 70}ms` }}>
          <h4>{c.label}</h4>
          <p className="val" data-testid={c.testId}>{c.value}</p>
          <span className="unit">{c.unit}</span>
        </div>
      ))}
    </div>
  );
}

function fillerUnit(m: SessionMetrics): string {
  if (!m.fillerHits.length) return 'NONE HEARD';
  return m.fillerHits.slice(0, 2).map(h => `“${h.word}” ×${h.times}`).join(' · ').toUpperCase();
}

function repeatUnit(m: SessionMetrics): string {
  if (!m.repeatedTokens.length) return 'NONE HEARD';
  return m.repeatedTokens.slice(0, 2).map(t => `“${t.token}” ×${t.times}`).join(' · ').toUpperCase();
}

/**
 * The results screen, organised around four questions rather than a wall of
 * numbers: what happened, what InSign noticed, what to aim at next, and what to
 * do about it. Everything shown is measured speaking behaviour — the system
 * never comments on whether the answer was a good answer, because it does not
 * know.
 */
export default function SessionResults({
  question,
  scenarioLabel,
  metrics,
  profile,
  targets,
  drill,
  comparison,
  observations,
  saveError,
  busy,
  onPracticeAgain,
  onNextQuestion,
  onFinish,
  onDiscard,
}: {
  question: PracticeQuestion;
  scenarioLabel: string;
  metrics: SessionMetrics;
  /** the user's history in this scenario as it stood before this session */
  profile: ScenarioProfile;
  targets: Target[];
  drill: Drill;
  /** present only when this attempt was working towards a target */
  comparison: TargetComparison[] | null;
  observations: Array<{ tone: string; text: string }>;
  saveError: string | null;
  busy: boolean;
  onPracticeAgain: () => void;
  onNextQuestion: (() => void) | null;
  onFinish: () => void;
  onDiscard: () => void;
}) {
  const spokenFor = formatClock(metrics.durationMs);

  return (
    <div className="results" data-testid="session-results">
      <header className="results-head">
        <p className="overline">SESSION RESULTS · {scenarioLabel.toUpperCase()}</p>
        <h1 className="statement-sm">Here's what that <em className="serif">sounded</em> like.</h1>
        <p className="results-question" data-testid="results-question">“{question.prompt}”</p>
        <p className="app-hint">
          Your answer lasted {spokenFor}. These are observations of how you spoke, not a score.
        </p>
      </header>

      <Headline metrics={metrics} />

      {comparison && comparison.length > 0 && (
        <section className="panel" aria-labelledby="progress-h" data-testid="target-progress">
          <div className="panel-head"><h3 id="progress-h">Target progress</h3></div>
          <div className="compare-grid">
            {comparison.map(c => (
              <div className={`compare ${c.status}`} key={c.metric}>
                <p className="micro">{c.label.toUpperCase()}</p>
                <p className="compare-move">
                  <span>{c.from ?? '—'}</span>
                  <span className="arrow" aria-hidden="true">→</span>
                  <b>{c.to ?? '—'}</b>
                </p>
                <p className="micro compare-target">TARGET {c.target.display}</p>
                <p className={`compare-status ${c.status}`} data-testid={`compare-${c.metric}`}>
                  {STATUS_COPY[c.status]}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="noticed-h">
        <div className="panel-head"><h3 id="noticed-h">What stood out</h3></div>
        <ul className="observations" data-testid="observations">
          {observations.map((o, i) => (
            <li key={i} className={o.tone}>{o.text}</li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="pattern-h" data-testid="scenario-pattern">
        <div className="panel-head">
          <h3 id="pattern-h">
            {profile.baseline ? 'Building your baseline' : `Your ${scenarioLabel.toLowerCase()} pattern`}
          </h3>
          <span className="micro">{profile.count} SAVED {scenarioLabel.toUpperCase()} SESSION{profile.count === 1 ? '' : 'S'}</span>
        </div>
        {profile.baseline ? (
          <p data-testid="baseline-note">
            InSign is learning your communication pattern for this scenario. After{' '}
            {Math.max(1, MIN_SESSIONS_FOR_PATTERN - profile.count)} more{' '}
            {scenarioLabel.toLowerCase()} session{MIN_SESSIONS_FOR_PATTERN - profile.count === 1 ? '' : 's'}{' '}
            the recommendations are drawn from your own history instead of this single attempt.
          </p>
        ) : (
          <div className="trend-grid">
            {FOCUS_ORDER.map(metric => (
              <div className={`trend ${profile.trends[metric]}`} key={metric}>
                <p className="micro">{FOCUS_LABELS[metric].toUpperCase()}</p>
                <p className="trend-word">{TREND_COPY[profile.trends[metric]]}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel next-practice" aria-labelledby="next-h">
        <div className="panel-head"><h3 id="next-h">Your next attempt</h3></div>

        <p className="micro">NEXT TARGET</p>
        <ul className="target-list big" data-testid="next-targets">
          {targets.map(t => (
            <li key={t.metric}>
              <span className="t-metric micro">{FOCUS_LABELS[t.metric].toUpperCase()}</span>
              <b>{t.display}</b>
              <span className="micro t-unit">{t.unit}</span>
            </li>
          ))}
        </ul>

        <p className="micro" style={{ marginTop: 22 }}>{drill.title}</p>
        <p className="drill-text" data-testid="drill-text">{drill.instruction}</p>
        <p className="micro" style={{ marginTop: 10 }}>
          SUGGESTED LENGTH {drill.durationSec}S · LEVEL {drill.level} OF 3
        </p>
      </section>

      {saveError && <p className="form-error" role="alert">{saveError}</p>}

      <div className="row results-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onPracticeAgain}
          disabled={busy}
          data-testid="practice-again"
        >
          {busy ? 'Saving…' : 'Practice again'} <span className="arrow">→</span>
        </button>
        {onNextQuestion && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onNextQuestion}
            disabled={busy}
            data-testid="next-question"
          >
            Next question
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onFinish}
          disabled={busy}
          data-testid="save-session"
        >
          Save and finish
        </button>
        <button type="button" className="link-btn micro" onClick={onDiscard} disabled={busy}>
          DISCARD THIS SESSION
        </button>
      </div>
      <p className="micro results-note">
        THIS SESSION IS KEPT WHEN YOU CONTINUE OR FINISH · DISCARD LEAVES NOTHING BEHIND
      </p>
    </div>
  );
}
