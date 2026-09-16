import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Four observations, not four scores. No bars implying judgment, no grading
 * language — the copy stays descriptive on purpose.
 */
export default function MetricTiles({ metrics }) {
    const slots = 24;
    const span = Math.max(1, metrics.durationMs);
    const hits = new Set(metrics.pauseAt.map(at => Math.min(slots - 1, Math.floor((at / span) * slots))));
    return (_jsxs("div", { className: "metrics", "data-testid": "metric-tiles", children: [_jsxs("div", { className: "metric", children: [_jsx("h4", { children: "PACE" }), _jsx("p", { className: "val", "data-testid": "metric-wpm", children: Math.round(metrics.wordsPerMinute) }), _jsxs("span", { className: "unit", children: ["WORDS PER MINUTE \u00B7 ", metrics.words, " WORDS"] })] }), _jsxs("div", { className: "metric", children: [_jsx("h4", { children: "PAUSES" }), _jsx("p", { className: "val", "data-testid": "metric-pauses", children: metrics.pauseCount }), _jsx("div", { className: "pause-timeline", "aria-hidden": "true", children: Array.from({ length: slots }, (_, i) => (_jsx("i", { className: hits.has(i) ? 'hit' : '' }, i))) }), _jsx("span", { className: "unit", children: "WHERE THEY HAPPENED" })] }), _jsxs("div", { className: "metric", children: [_jsx("h4", { children: "REPETITIONS" }), _jsx("p", { className: "val", "data-testid": "metric-repetitions", children: metrics.repetitionCount }), _jsx("span", { className: "unit", children: metrics.repeatedTokens.length
                            ? metrics.repeatedTokens.slice(0, 2).map(t => `“${t.token}” ×${t.times}`).join(' · ').toUpperCase()
                            : 'SOUNDS REVISITED' })] }), _jsxs("div", { className: "metric", children: [_jsx("h4", { children: "FILLERS" }), _jsx("p", { className: "val", "data-testid": "metric-fillers", children: metrics.fillerCount }), _jsx("span", { className: "unit", children: metrics.fillerHits.length
                            ? metrics.fillerHits.slice(0, 2).map(h => `“${h.word}” ×${h.times}`).join(' · ').toUpperCase()
                            : 'PATTERNS OF HESITATION' })] })] }));
}
