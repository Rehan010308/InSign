import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../services/authService';
import {
  flushPendingSessions, getOpenRecommendation, listSignSessions, listSpeechSessions,
} from '../services/sessionService';
import { detectPattern, weeklyActivity } from '../services/personalizationEngine';
import { SCENARIO_LABELS, type PracticeRecommendation, type SignSession, type SpeechSession } from '../types';

function relative(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'JUST NOW';
  if (mins < 60) return `${mins}M AGO`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  const days = Math.round(hrs / 24);
  return `${days}D AGO`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [speech, setSpeech] = useState<SpeechSession[]>([]);
  const [signs, setSigns] = useState<SignSession[]>([]);
  const [rec, setRec] = useState<PracticeRecommendation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      await flushPendingSessions(user.id);
      const [s, g, r] = await Promise.all([
        listSpeechSessions(user.id),
        listSignSessions(user.id),
        getOpenRecommendation(user.id),
      ]);
      if (!alive) return;
      setSpeech(s);
      setSigns(g);
      setRec(r);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user]);

  const analysis = useMemo(() => detectPattern(speech), [speech]);
  const activity = useMemo(() => weeklyActivity(speech), [speech]);
  const maxWeek = Math.max(1, ...activity);
  const name = user?.displayName || user?.email?.split('@')[0] || 'there';

  return (
    <div className="wrap stack-lg">
      <header className="dash-head">
        <p className="overline">DASHBOARD</p>
        <h1 className="statement-sm">Welcome back, <em className="serif">{name}</em>.</h1>
        <p className="app-hint">
          Two practices, one idea: the tool adapts to you. Nothing is recorded until you save a session.
        </p>
      </header>

      <section className="dash-panels" aria-label="Products">
        <Link className="panel dash-panel link-card" to="/app/speech">
          <span className="micro eyebrow">PRODUCT 01 · PRACTICE, NOT JUDGMENT</span>
          <h2>Speech Companion</h2>
          <p>
            Answer a real question out loud. InSign measures pace, pauses, repetitions and fillers
            — locally — then sets one measurable target for your next attempt.
          </p>
          <span className="go">START A SESSION <span className="arrow">→</span></span>
        </Link>

        <Link className="panel dash-panel link-card" to="/app/sign">
          <span className="micro eyebrow">PRODUCT 02 · MOVEMENT, TOLERATED</span>
          <h2>Sign Translator</h2>
          <p>
            Point your camera at a sign. Hand landmarks are stabilised on-device and matched over
            time against a controlled prototype vocabulary.
          </p>
          <span className="go">OPEN THE CAMERA <span className="arrow">→</span></span>
        </Link>
      </section>

      <section aria-labelledby="next-h">
        <div className="section-head">
          <p className="overline" id="next-h">NEXT PRACTICE</p>
        </div>
        <div className="panel next-practice">
          {loading ? (
            <p className="micro">READING YOUR SESSIONS…</p>
          ) : (
            <>
              <h3>{rec?.recommendation ?? analysis.recommendation}</h3>
              <p className="evidence">{analysis.rationale}</p>
              {analysis.pattern && (
                <p className="evidence" style={{ marginTop: 8 }}>
                  Pattern: <b>{analysis.pattern.replace(/_/g, ' ')}</b>
                  {analysis.scenario ? ` · ${SCENARIO_LABELS[analysis.scenario]}` : ''} · confidence {analysis.confidence.toFixed(2)}
                </p>
              )}
              <div className="row" style={{ marginTop: 20 }}>
                <Link
                  className="btn btn-primary btn-sm"
                  to={`/app/speech${analysis.scenario ? `?scenario=${analysis.scenario}` : ''}`}
                >
                  Practise now <span className="arrow">→</span>
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="progress-h">
        <div className="section-head">
          <p className="overline" id="progress-h">YOUR PROGRESS</p>
          <Link className="micro" to="/app/speech/history">ALL SESSIONS →</Link>
        </div>

        <div className="panel-grid">
          <div className="panel">
            <div className="panel-head"><h3>Recent speech sessions</h3></div>
            {speech.length === 0 ? (
              <p className="empty-state">No sessions yet — your first practice will appear here.</p>
            ) : (
              <div className="session-list">
                {speech.slice(0, 4).map(s => (
                  <Link className="session-row" key={s.id} to={`/app/speech/history/${s.id}`}>
                    <div>
                      <span className="chip">{SCENARIO_LABELS[s.scenario]}</span>
                      <p className="when" style={{ marginTop: 8 }}>{relative(s.created_at)}</p>
                    </div>
                    <div className="stats">
                      <span><b>{Math.round(s.words_per_minute)}</b> WPM</span>
                      <span><b>{s.pause_count}</b> PAUSES</span>
                      <span><b>{s.repetition_count}</b> REPEATS</span>
                      <span><b>{s.filler_count}</b> FILLERS</span>
                    </div>
                    <span className="arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Activity</h3></div>
            <p className="evidence">Speech sessions per week, last six weeks.</p>
            <div className="activity" aria-hidden="true">
              {activity.map((count, i) => (
                <div className="wk" key={i}>
                  <div className="bar-fill" style={{ height: `${Math.round((count / maxWeek) * 46)}px` }} />
                  <span>{count}</span>
                </div>
              ))}
            </div>
            <p className="micro" style={{ marginTop: 14 }}>
              {speech.length} SPEECH · {signs.length} SIGN SESSION{signs.length === 1 ? '' : 'S'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
