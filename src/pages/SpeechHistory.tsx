import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../services/authService';
import { listSpeechSessions } from '../services/sessionService';
import { detectPattern } from '../services/personalizationEngine';
import { SCENARIO_LABELS, type SpeechSession } from '../types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).toUpperCase();
}

export default function SpeechHistory() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [sessions, setSessions] = useState<SpeechSession[]>([]);
  const [loading, setLoading] = useState(true);
  const saved = params.get('saved') === '1';

  useEffect(() => {
    if (!user) return;
    let alive = true;
    listSpeechSessions(user.id).then(s => {
      if (!alive) return;
      setSessions(s);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user]);

  const analysis = useMemo(() => detectPattern(sessions), [sessions]);

  return (
    <div className="wrap stack-lg">
      <header>
        <p className="overline">SPEECH HISTORY</p>
        <h1 className="statement-sm">Every session you <em className="serif">kept</em>.</h1>
        <p className="app-hint">
          Sessions are observations, not scores. The pattern below is derived from these rows only.
        </p>
      </header>

      {saved && (
        <div className="notice" role="status">
          <strong>Session saved.</strong> Your recommendation has been recalculated from your full history.
        </div>
      )}

      <section className="panel next-practice" aria-labelledby="pattern-h">
        <div className="panel-head"><h3 id="pattern-h">Next practice</h3></div>
        <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--text-primary)' }} data-testid="recommendation">
          {analysis.recommendation}
        </p>
        <p className="evidence" style={{ marginTop: 10 }} data-testid="rationale">{analysis.rationale}</p>
        {analysis.pattern && (
          <p className="evidence" style={{ marginTop: 6 }}>
            Pattern: <b>{analysis.pattern.replace(/_/g, ' ')}</b> · confidence {analysis.confidence.toFixed(2)}
          </p>
        )}
      </section>

      <section aria-labelledby="sessions-h">
        <div className="section-head">
          <p className="overline" id="sessions-h">SESSIONS</p>
          <Link className="micro" to="/app/speech">NEW SESSION →</Link>
        </div>

        {loading ? (
          <p className="micro">LOADING…</p>
        ) : sessions.length === 0 ? (
          <p className="empty-state">No sessions yet — your first practice will appear here.</p>
        ) : (
          <div className="session-list" data-testid="session-list">
            {sessions.map(s => (
              <Link className="session-row" key={s.id} to={`/app/speech/history/${s.id}`}>
                <div>
                  <span className="chip">{SCENARIO_LABELS[s.scenario]}</span>
                  <p className="when" style={{ marginTop: 8 }}>{formatDate(s.created_at)}</p>
                </div>
                <div className="stats">
                  <span><b>{Math.round(s.words_per_minute)}</b> WPM</span>
                  <span><b>{s.pause_count}</b> PAUSES</span>
                  <span><b>{s.repetition_count}</b> REPEATS</span>
                  <span><b>{s.filler_count}</b> FILLERS</span>
                  <span>{s.transcript ? 'TRANSCRIPT KEPT' : 'TRANSCRIPT NOT STORED'}</span>
                </div>
                <span className="arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
