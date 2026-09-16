import type { PracticeQuestion } from '../../lib/speech/questionBank';
import type { Drill, Target } from '../../lib/speech/coach';
import { SCENARIO_LABELS, type Scenario } from '../../types';

/** How each scenario names the thing it is asking for. */
const PROMPT_LABEL: Record<Scenario, string> = {
  interview: 'QUESTION',
  presentation: 'PROMPT',
  phone_call: 'SITUATION',
  introduction: 'PROMPT',
  conversation: 'SITUATION',
  custom: 'YOUR SITUATION',
};

const SCREEN_TITLE: Record<Scenario, string> = {
  interview: 'INTERVIEW PRACTICE',
  presentation: 'PRESENTATION PRACTICE',
  phone_call: 'PHONE CALL PRACTICE',
  introduction: 'INTRODUCTION PRACTICE',
  conversation: 'EVERYDAY CONVERSATION',
  custom: 'CUSTOM PRACTICE',
};

/** A quiet ●●○○○ rather than a score out of five. */
export function SessionProgress({ index, total }: { index: number; total: number }) {
  if (total <= 1) return null;
  return (
    <div className="q-progress" data-testid="question-progress">
      <span className="dots" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < index ? 'done' : i === index ? 'now' : ''} />
        ))}
      </span>
      <span className="micro">QUESTION {index + 1} OF {total}</span>
    </div>
  );
}

/**
 * The prepare screen: one question, one clear action.
 *
 * Every scenario reaches it, but none of them looks the same — an interview
 * shows a numbered question, a phone call shows the situation and the task it
 * sets, a presentation shows what it wants and how long it should take. When
 * the user is coming back for another attempt, the target and drill they are
 * working towards sit underneath, so Practice Again never loses the point.
 */
export default function PracticePrompt({
  scenario,
  question,
  index,
  total,
  targets,
  drill,
  repeat,
  onStart,
  onSkip,
  startLabel,
  disabled,
}: {
  scenario: Scenario;
  question: PracticeQuestion;
  index: number;
  total: number;
  targets: Target[];
  drill: Drill | null;
  /** true when this is a second attempt at the same question */
  repeat: boolean;
  onStart: () => void;
  onSkip?: () => void;
  startLabel: string;
  disabled?: boolean;
}) {
  const duration = drill?.durationSec ?? question.durationTarget;

  return (
    <section className="prompt-card" data-testid="practice-prompt" aria-labelledby="prompt-h">
      <div className="prompt-top">
        <p className="overline">{SCREEN_TITLE[scenario]}</p>
        <SessionProgress index={index} total={total} />
      </div>

      <p className="micro prompt-kind">{PROMPT_LABEL[scenario]}</p>
      <h1 className="prompt-text" id="prompt-h" data-testid="prompt-text">{question.prompt}</h1>

      {question.task && (
        <div className="prompt-task">
          <p className="micro">YOUR TASK</p>
          <p data-testid="prompt-task">{question.task}</p>
        </div>
      )}

      {question.note && <p className="prompt-note">{question.note}</p>}

      <div className="prompt-meta">
        <span className="meta-pill"><b>{duration}s</b> suggested</span>
        <span className="meta-pill">{SCENARIO_LABELS[scenario]}</span>
        {repeat && <span className="meta-pill accent" data-testid="repeat-pill">Second attempt</span>}
      </div>

      {(targets.length > 0 || drill) && (
        <div className="prompt-brief" data-testid="prompt-brief">
          {targets.length > 0 && (
            <div className="brief-block">
              <p className="micro">YOUR TARGET</p>
              <ul className="target-list">
                {targets.map(t => (
                  <li key={t.metric}>
                    <span className="t-metric micro">{t.metric.toUpperCase()}</span>
                    <b>{t.display}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {drill && (
            <div className="brief-block">
              <p className="micro">{drill.title}</p>
              <p className="drill-text" data-testid="prompt-drill">{drill.instruction}</p>
            </div>
          )}
        </div>
      )}

      <div className="row prompt-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onStart}
          disabled={disabled}
          data-testid="start-practice"
        >
          {startLabel} <span className="arrow">→</span>
        </button>
        {onSkip && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onSkip} data-testid="skip-question">
            Another question
          </button>
        )}
      </div>
    </section>
  );
}
