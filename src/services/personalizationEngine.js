import { SCENARIO_LABELS } from '../types';
/* ------------------------------------------------------------ tuneables */
export const MIN_SESSIONS_PER_SCENARIO = 3;
export const RECENCY_WINDOW_DAYS = 14;
export const PAUSE_RATIO_THRESHOLD = 1.3;
export const PACE_DECLINE_THRESHOLD = 0.1;
export const REPETITION_RATIO_THRESHOLD = 2;
export const FILLER_RATIO_THRESHOLD = 2;
export const MIN_CONFIDENCE = 0.5;
export const MAX_CONFIDENCE = 0.9;
export const INSUFFICIENT_HISTORY = {
    pattern: null,
    scenario: null,
    confidence: 0,
    recommendation: 'Complete a few more sessions to uncover your communication patterns.',
    rationale: `A pattern needs at least ${MIN_SESSIONS_PER_SCENARIO} sessions in the same scenario within ${RECENCY_WINDOW_DAYS} days.`,
    evidence: {},
};
export function median(values) {
    if (!values.length)
        return 0;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
/** Words are derived from the metrics themselves, so a redacted transcript still counts. */
export function estimateWords(s) {
    return Math.max(1, Math.round((s.words_per_minute * s.duration_ms) / 60000));
}
function withinWindow(s, now) {
    const t = Date.parse(s.created_at);
    if (Number.isNaN(t))
        return false;
    return now - t <= RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
/** Oldest first. */
function chronological(sessions) {
    return [...sessions].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}
/**
 * Evidence-based confidence in 0.5–0.9: half of it comes from how much data
 * backs the claim, half from how big the effect is. Never a spuriously precise
 * decimal — it is rounded to two places and explained in the UI.
 */
export function evidenceConfidence(sampleSize, effectRatio) {
    const sample = Math.min(1, (sampleSize - MIN_SESSIONS_PER_SCENARIO + 1) / 4);
    const effect = Math.min(1, Math.max(0, effectRatio));
    const raw = MIN_CONFIDENCE + (MAX_CONFIDENCE - MIN_CONFIDENCE) * (0.5 * sample + 0.5 * effect);
    return Math.round(raw * 100) / 100;
}
export function detectPattern(sessions, now = Date.now()) {
    const recent = sessions.filter(s => withinWindow(s, now));
    if (recent.length < MIN_SESSIONS_PER_SCENARIO)
        return INSUFFICIENT_HISTORY;
    const byScenario = new Map();
    for (const s of recent) {
        const list = byScenario.get(s.scenario) ?? [];
        list.push(s);
        byScenario.set(s.scenario, list);
    }
    const eligible = [...byScenario.entries()]
        .filter(([, list]) => list.length >= MIN_SESSIONS_PER_SCENARIO)
        // Deterministic order when two scenarios both qualify: most sessions, then name.
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    if (!eligible.length)
        return INSUFFICIENT_HISTORY;
    const candidates = [];
    for (const [scenario, listRaw] of eligible) {
        const list = chronological(listRaw);
        const others = recent.filter(s => s.scenario !== scenario);
        const label = SCENARIO_LABELS[scenario].toLowerCase();
        const n = list.length;
        /* --- longer pauses ------------------------------------------------- */
        const pauses = list.map(s => s.pause_count);
        const medianPauses = median(pauses);
        const crossMedian = median(recent.map(s => s.pause_count));
        if (crossMedian > 0 && medianPauses >= crossMedian * PAUSE_RATIO_THRESHOLD) {
            const firstHalf = median(pauses.slice(0, Math.floor(n / 2)));
            const lastHalf = median(pauses.slice(Math.ceil(n / 2)));
            const trendingFlatOrUp = lastHalf >= firstHalf * 0.95;
            if (trendingFlatOrUp) {
                const ratio = medianPauses / crossMedian;
                const avg = Math.round(pauses.reduce((a, b) => a + b, 0) / n);
                candidates.push({
                    pattern: 'longer_pauses',
                    scenario,
                    confidence: evidenceConfidence(n, (ratio - PAUSE_RATIO_THRESHOLD) / PAUSE_RATIO_THRESHOLD),
                    recommendation: `Your last ${n} ${label} sessions averaged ${avg} pauses — the most of any scenario. Try another ${label} round focused on response pacing.`,
                    rationale: `Based on your last ${n} ${label} sessions: median ${medianPauses} pauses against ${crossMedian} across everything else.`,
                    evidence: { sessions: n, median_pauses: medianPauses, cross_median_pauses: crossMedian, ratio: Math.round(ratio * 100) / 100 },
                });
            }
        }
        /* --- slowing pace -------------------------------------------------- */
        if (n >= MIN_SESSIONS_PER_SCENARIO) {
            const early = median(list.slice(0, Math.floor(n / 2)).map(s => s.words_per_minute));
            const late = median(list.slice(Math.ceil(n / 2)).map(s => s.words_per_minute));
            if (early > 0 && late > 0) {
                const decline = (early - late) / early;
                if (decline >= PACE_DECLINE_THRESHOLD) {
                    candidates.push({
                        pattern: 'slowing_pace',
                        scenario,
                        confidence: evidenceConfidence(n, (decline - PACE_DECLINE_THRESHOLD) / 0.3),
                        recommendation: `Your ${label} pace has eased from about ${Math.round(early)} to ${Math.round(late)} words per minute across ${n} sessions. Try a shorter ${label} round and let the pace settle where it wants to.`,
                        rationale: `Based on your last ${n} ${label} sessions: median pace fell ${Math.round(decline * 100)}%.`,
                        evidence: { sessions: n, early_wpm: Math.round(early), late_wpm: Math.round(late), decline_pct: Math.round(decline * 100) },
                    });
                }
            }
        }
        /* --- repetitions --------------------------------------------------- */
        const rateIn = rate(list, s => s.repetition_count);
        const rateOut = rate(others, s => s.repetition_count);
        if (others.length && rateOut > 0 && rateIn >= rateOut * REPETITION_RATIO_THRESHOLD) {
            const ratio = rateIn / rateOut;
            candidates.push({
                pattern: 'frequent_repetitions',
                scenario,
                confidence: evidenceConfidence(n, (ratio - REPETITION_RATIO_THRESHOLD) / REPETITION_RATIO_THRESHOLD),
                recommendation: `You revisit words about ${ratio.toFixed(1)}× more often in ${label} practice than elsewhere (${rateIn.toFixed(1)} per 100 words). Another ${label} round — slower openings, same content — is the useful next step.`,
                rationale: `Based on your last ${n} ${label} sessions compared with ${others.length} other sessions.`,
                evidence: { sessions: n, per_100_words: Math.round(rateIn * 10) / 10, elsewhere_per_100_words: Math.round(rateOut * 10) / 10 },
            });
        }
        /* --- fillers ------------------------------------------------------- */
        const fillIn = rate(list, s => s.filler_count);
        const fillOut = rate(others, s => s.filler_count);
        if (others.length && fillOut > 0 && fillIn >= fillOut * FILLER_RATIO_THRESHOLD) {
            const ratio = fillIn / fillOut;
            candidates.push({
                pattern: 'filler_heavy',
                scenario,
                confidence: evidenceConfidence(n, (ratio - FILLER_RATIO_THRESHOLD) / FILLER_RATIO_THRESHOLD),
                recommendation: `Filler words show up about ${ratio.toFixed(1)}× more in ${label} practice than elsewhere (${fillIn.toFixed(1)} per 100 words). Try one more ${label} round and let the silences sit where the fillers were.`,
                rationale: `Based on your last ${n} ${label} sessions compared with ${others.length} other sessions.`,
                evidence: { sessions: n, per_100_words: Math.round(fillIn * 10) / 10, elsewhere_per_100_words: Math.round(fillOut * 10) / 10 },
            });
        }
    }
    if (!candidates.length) {
        return {
            pattern: null,
            scenario: null,
            confidence: 0,
            recommendation: 'No single pattern stands out yet — your sessions look consistent. Keep practising and InSign will say something when there is something to say.',
            rationale: `Checked ${recent.length} sessions from the last ${RECENCY_WINDOW_DAYS} days.`,
            evidence: { sessions_considered: recent.length },
        };
    }
    // Strongest evidence wins; ties broken deterministically by pattern name.
    candidates.sort((a, b) => b.confidence - a.confidence || (a.pattern ?? '').localeCompare(b.pattern ?? ''));
    return candidates[0];
}
function rate(sessions, pick) {
    const words = sessions.reduce((sum, s) => sum + estimateWords(s), 0);
    if (!words)
        return 0;
    const total = sessions.reduce((sum, s) => sum + pick(s), 0);
    return (total / words) * 100;
}
/** Per-week session counts for the dashboard activity strip, oldest week first. */
export function weeklyActivity(sessions, weeks = 6, now = Date.now()) {
    const out = new Array(weeks).fill(0);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    for (const s of sessions) {
        const t = Date.parse(s.created_at);
        if (Number.isNaN(t))
            continue;
        const idx = weeks - 1 - Math.floor((now - t) / weekMs);
        if (idx >= 0 && idx < weeks)
            out[idx]++;
    }
    return out;
}
