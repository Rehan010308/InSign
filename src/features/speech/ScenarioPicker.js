import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { SCENARIOS, SCENARIO_HINTS, SCENARIO_LABELS } from '../../types';
export default function ScenarioPicker({ value, onChange, }) {
    return (_jsx("div", { className: "scenarios", role: "group", "aria-label": "Choose a practice scenario", children: SCENARIOS.map((s, i) => (_jsxs("button", { type: "button", className: "scenario", "aria-pressed": value === s, onClick: () => onChange(s), children: [_jsx("span", { className: "cap", children: String(i + 1).padStart(2, '0') }), _jsx("h3", { children: SCENARIO_LABELS[s] }), _jsx("p", { children: SCENARIO_HINTS[s] })] }, s))) }));
}
