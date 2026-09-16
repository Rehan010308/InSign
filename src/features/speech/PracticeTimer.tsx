import { useEffect, useState } from 'react';

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The elapsed clock, kept in its own component on purpose.
 *
 * It ticks four times a second; if that state lived on the practice page, every
 * tick would re-render the transcript and the listening stage along with it.
 * Isolating it means a running timer costs one small text node per tick.
 */
export default function PracticeTimer({
  startedAt,
  running,
  targetSec,
}: {
  /** performance.now() at the moment the session began */
  startedAt: number;
  running: boolean;
  /** how long the prompt suggests taking; shown as a quiet reference */
  targetSec?: number;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    setElapsed(performance.now() - startedAt);
    const id = window.setInterval(() => setElapsed(performance.now() - startedAt), 250);
    return () => clearInterval(id);
  }, [running, startedAt]);

  const overTarget = targetSec ? elapsed / 1000 > targetSec : false;

  return (
    <div className="practice-clock">
      <p className="timer" data-testid="timer" aria-label="Elapsed time">{formatClock(elapsed)}</p>
      {targetSec ? (
        <span className={`clock-target micro${overTarget ? ' over' : ''}`}>
          TARGET {formatClock(targetSec * 1000)}
        </span>
      ) : null}
    </div>
  );
}
