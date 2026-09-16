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
          aria-pressed={value === s}
          onClick={() => onChange(s)}
        >
          <span className="cap">{String(i + 1).padStart(2, '0')}</span>
          <h3>{SCENARIO_LABELS[s]}</h3>
          <p>{SCENARIO_HINTS[s]}</p>
        </button>
      ))}
    </div>
  );
}
