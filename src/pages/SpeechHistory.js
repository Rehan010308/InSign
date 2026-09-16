import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../services/authService';
import { listSpeechSessions } from '../services/sessionService';
import { detectPattern } from '../services/personalizationEngine';
import { SCENARIO_LABELS } from '../types';
function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).toUpperCase();
}
export default function SpeechHistory() {
    const { user } = useAuth();
    const [params] = useSearchParams();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const saved = params.get('saved') === '1';
    useEffect(() => {
        if (!user)
            return;
        let alive = true;
        listSpeechSessions(user.id).then(s => {
            if (!alive)
                return;
            setSessions(s);
            setLoading(false);
        });
        return () => { alive = false; };
    }, [user]);
    const analysis = useMemo(() => detectPattern(sessions), [sessions]);
    return (_jsxs("div", { className: "wrap stack-lg", children: [_jsxs("header", { children: [_jsx("p", { className: "overline", children: "SPEECH HISTORY" }), _jsxs("h1", { className: "statement-sm", children: ["Every session you ", _jsx("em", { className: "serif", children: "kept" }), "."] }), _jsx("p", { className: "app-hint", children: "Sessions are observations, not scores. The pattern below is derived from these rows only." })] }), saved && (_jsxs("div", { className: "notice", role: "status", children: [_jsx("strong", { children: "Session saved." }), " Your recommendation has been recalculated from your full history."] })), _jsxs("section", { className: "panel next-practice", "aria-labelledby": "pattern-h", children: [_jsx("div", { className: "panel-head", children: _jsx("h3", { id: "pattern-h", children: "Next practice" }) }), _jsx("p", { style: { fontSize: 16, lineHeight: 1.7, color: 'var(--text-primary)' }, "data-testid": "recommendation", children: analysis.recommendation }), _jsx("p", { className: "evidence", style: { marginTop: 10 }, "data-testid": "rationale", children: analysis.rationale }), analysis.pattern && (_jsxs("p", { className: "evidence", style: { marginTop: 6 }, children: ["Pattern: ", _jsx("b", { children: analysis.pattern.replace(/_/g, ' ') }), " \u00B7 confidence ", analysis.confidence.toFixed(2)] }))] }), _jsxs("section", { "aria-labelledby": "sessions-h", children: [_jsxs("div", { className: "section-head", children: [_jsx("p", { className: "overline", id: "sessions-h", children: "SESSIONS" }), _jsx(Link, { className: "micro", to: "/app/speech", children: "NEW SESSION \u2192" })] }), loading ? (_jsx("p", { className: "micro", children: "LOADING\u2026" })) : sessions.length === 0 ? (_jsx("p", { className: "empty-state", children: "No sessions yet \u2014 your first practice will appear here." })) : (_jsx("div", { className: "session-list", "data-testid": "session-list", children: sessions.map(s => (_jsxs(Link, { className: "session-row", to: `/app/speech/history/${s.id}`, children: [_jsxs("div", { children: [_jsx("span", { className: "chip", children: SCENARIO_LABELS[s.scenario] }), _jsx("p", { className: "when", style: { marginTop: 8 }, children: formatDate(s.created_at) })] }), _jsxs("div", { className: "stats", children: [_jsxs("span", { children: [_jsx("b", { children: Math.round(s.words_per_minute) }), " WPM"] }), _jsxs("span", { children: [_jsx("b", { children: s.pause_count }), " PAUSES"] }), _jsxs("span", { children: [_jsx("b", { children: s.repetition_count }), " REPEATS"] }), _jsxs("span", { children: [_jsx("b", { children: s.filler_count }), " FILLERS"] }), _jsx("span", { children: s.transcript ? 'TRANSCRIPT KEPT' : 'TRANSCRIPT NOT STORED' })] }), _jsx("span", { className: "arrow", "aria-hidden": "true", children: "\u2192" })] }, s.id))) }))] })] }));
}
