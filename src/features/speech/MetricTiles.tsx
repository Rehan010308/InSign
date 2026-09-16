import type { SessionMetrics } from '../../lib/speech/metrics';

/**
 * Four observations, not four scores. No bars implying judgment, no grading
 * language — the copy stays descriptive on purpose.
 */
export default function MetricTiles({ metrics }: { metrics: SessionMetrics }) {
  const slots = 24;
  const span = Math.max(1, metrics.durationMs);
  const hits = new Set(metrics.pauseAt.map(at => Math.min(slots - 1, Math.floor((at / span) * slots))));

  return (
    <div className="metrics" data-testid="metric-tiles">
      <div className="metric">
        <h4>PACE</h4>
        <p className="val" data-testid="metric-wpm">{Math.round(metrics.wordsPerMinute)}</p>
        <span className="unit">WORDS PER MINUTE · {metrics.words} WORDS</span>
      </div>

      <div className="metric">
        <h4>PAUSES</h4>
        <p className="val" data-testid="metric-pauses">{metrics.pauseCount}</p>
        <div className="pause-timeline" aria-hidden="true">
          {Array.from({ length: slots }, (_, i) => (
            <i key={i} className={hits.has(i) ? 'hit' : ''} />
          ))}
        </div>
        <span className="unit">WHERE THEY HAPPENED</span>
      </div>

      <div className="metric">
        <h4>REPETITIONS</h4>
        <p className="val" data-testid="metric-repetitions">{metrics.repetitionCount}</p>
        <span className="unit">
          {metrics.repeatedTokens.length
            ? metrics.repeatedTokens.slice(0, 2).map(t => `“${t.token}” ×${t.times}`).join(' · ').toUpperCase()
            : 'SOUNDS REVISITED'}
        </span>
      </div>

      <div className="metric">
        <h4>FILLERS</h4>
        <p className="val" data-testid="metric-fillers">{metrics.fillerCount}</p>
        <span className="unit">
          {metrics.fillerHits.length
            ? metrics.fillerHits.slice(0, 2).map(h => `“${h.word}” ×${h.times}`).join(' · ').toUpperCase()
            : 'PATTERNS OF HESITATION'}
        </span>
      </div>
    </div>
  );
}
