import { memo } from 'react';
import LiveTranscript from './LiveTranscript';
import PracticeTimer from './PracticeTimer';
import VoiceBars from './VoiceBars';
import type { PracticeQuestion } from '../../lib/speech/questionBank';
import type { RecognitionError, RecognitionState } from '../../lib/speech/useSpeechRecognition';

export type StagePhase = 'listening' | 'processing';

function stateLabel(phase: StagePhase, recognition: RecognitionState): string {
  if (phase === 'processing') return 'PROCESSING';
  switch (recognition) {
    case 'requesting_permission': return 'ASKING FOR THE MICROPHONE';
    case 'listening': return 'LISTENING';
    case 'error': return 'STOPPED';
    default: return 'READY';
  }
}

/**
 * The speaking screen. One job: make it obvious that the microphone is on and
 * the words are arriving — and then get out of the way.
 *
 * No metric is shown here on purpose. Watching a pace counter move while
 * answering a question changes how people answer it, so every number waits for
 * the results screen.
 */
function ListeningStage({
  question,
  phase,
  recognitionState,
  error,
  reconnected,
  silent,
  level,
  startedAt,
  finalTranscript,
  interim,
  onStop,
  onCancel,
}: {
  question: PracticeQuestion;
  phase: StagePhase;
  recognitionState: RecognitionState;
  error: RecognitionError | null;
  reconnected: boolean;
  silent: boolean;
  level: { current: number };
  startedAt: number;
  finalTranscript: string;
  interim: string;
  onStop: () => void;
  onCancel: () => void;
}) {
  const live = phase === 'listening' && recognitionState === 'listening';

  return (
    <section className="stage" data-testid="listening-stage" data-phase={phase}>
      <div className="stage-head">
        <div className="stage-question">
          <p className="micro">YOU ARE ANSWERING</p>
          <p className="stage-prompt" data-testid="stage-prompt">{question.prompt}</p>
        </div>
        <PracticeTimer
          startedAt={startedAt}
          running={phase === 'listening'}
          targetSec={question.durationTarget}
        />
      </div>

      <div className="stage-mic">
        <span
          className={`state-chip${live ? ' live' : error ? ' warn' : ''}`}
          role="status"
          data-testid="speech-state"
        >
          <i />{stateLabel(phase, recognitionState)}
        </span>
        <VoiceBars level={level} active={live} />
        <div className="stage-flags">
          {reconnected && <span className="micro">RECONNECTED — STILL LISTENING</span>}
          {silent && live && <span className="micro warn-text">NOTHING HEARD YET — STILL LISTENING</span>}
        </div>
      </div>

      <LiveTranscript final={finalTranscript} interim={interim} listening={live} />

      {error && (
        <div className="notice" role="alert" data-testid="speech-error">{error.message}</div>
      )}

      <div className="row stage-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onStop}
          disabled={phase === 'processing'}
          data-testid="stop-session"
        >
          {phase === 'processing' ? 'Finishing…' : 'Stop and see results'}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onCancel}
          disabled={phase === 'processing'}
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

export default memo(ListeningStage);
