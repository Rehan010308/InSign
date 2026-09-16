import { SCENARIOS, SCENARIO_HINTS, SCENARIO_LABELS, type Scenario } from '../../types';

export default function ScenarioPicker({
  value, onChange,
}: {
  value: Scenario | null;
  onChange: (s: Scenario) => void;
}) {
  return (
    <div className="scenarios" role="group" aria-label="Choose a practice scenario">
      {SCENARIOS.map((s, i) => (
        <button
          key={s}
          type="button"
          className="scenario"
          // The card shows a number, a name and a hint; the accessible name is
          // just the scenario, so "Interview" is what a screen reader announces
          // and what a test can ask for.
          aria-label={SCENARIO_LABELS[s]}
          aria-pressed={value === s}
          onClick={() => onChange(s)}
          data-testid={`scenario-${s}`}
        >
          <span className="cap">{String(i + 1).padStart(2, '0')}</span>
          <h3>{SCENARIO_LABELS[s]}</h3>
          <p>{SCENARIO_HINTS[s]}</p>
        </button>
      ))}
    </div>
  );
}
