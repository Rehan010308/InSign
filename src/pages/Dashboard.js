import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../services/authService';
import { flushPendingSessions, getOpenRecommendation, listSignSessions, listSpeechSessions, } from '../services/sessionService';
import { detectPattern, weeklyActivity } from '../services/personalizationEngine';
import { SCENARIO_LABELS } from '../types';
function relative(iso) {
    const diff = Date.now() - Date.parse(iso);
    const mins = Math.round(diff / 60000);
    if (mins < 1)
        return 'JUST NOW';
    if (mins < 60)
        return `${mins}M AGO`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24)
        return `${hrs}H AGO`;
    const days = Math.round(hrs / 24);
    return `${days}D AGO`;
}
export default function Dashboard() {
    const { user } = useAuth();
    const [speech, setSpeech] = useState([]);
    const [signs, setSigns] = useState([]);
    const [rec, setRec] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!user)
            return;
        let alive = true;
        (async () => {
            await flushPendingSessions(user.id);
            const [s, g, r] = await Promise.all([
                listSpeechSessions(user.id),
                listSignSessions(user.id),
                getOpenRecommendation(user.id),
            ]);
            if (!alive)
                return;
            setSpeech(s);
            setSigns(g);
            setRec(r);
            setLoading(false);
        })();
        return () => { alive = false; };
    }, [user]);
    const analysis = useMemo(() => detectPattern(speech), [speech]);
    const activity = useMemo(() => weeklyActivity(speech), [speech]);
    const maxWeek = Math.max(1, ...activity);
    const name = user?.displayName || user?.email?.split('@')[0] || 'there';
    return (_jsxs("div", { className: "wrap stack-lg", children: [_jsxs("header", { className: "dash-head", children: [_jsx("p", { className: "overline", children: "DASHBOARD" }), _jsxs("h1", { className: "statement-sm", children: ["Welcome back, ", _jsx("em", { className: "serif", children: name }), "."] }), _jsx("p", { className: "app-hint", children: "Two practices, one idea: the tool adapts to you. Nothing is recorded until you save a session." })] }), _jsxs("section", { className: "dash-panels", "aria-label": "Products", children: [_jsxs(Link, { className: "panel dash-panel link-card", to: "/app/speech", children: [_jsx("span", { className: "micro eyebrow", children: "PRODUCT 01 \u00B7 PRACTICE, NOT JUDGMENT" }), _jsx("h2", { children: "Speech Companion" }), _jsx("p", { children: "Practise a scenario out loud. InSign observes pace, pauses, repetitions and fillers \u2014 locally \u2014 and remembers what it saw." }), _jsxs("span", { className: "go", children: ["START A SESSION ", _jsx("span", { className: "arrow", children: "\u2192" })] })] }), _jsxs(Link, { className: "panel dash-panel link-card", to: "/app/sign", children: [_jsx("span", { className: "micro eyebrow", children: "PRODUCT 02 \u00B7 MOVEMENT, TOLERATED" }), _jsx("h2", { children: "Sign Translator" }), _jsx("p", { children: "Point your camera at a sign. Hand landmarks are stabilised on-device and matched against a small prototype vocabulary of eight signs." }), _jsxs("span", { className: "go", children: ["OPEN THE CAMERA ", _jsx("span", { className: "arrow", children: "\u2192" })] })] })] }), _jsxs("section", { "aria-labelledby": "next-h", children: [_jsx("div", { className: "section-head", children: _jsx("p", { className: "overline", id: "next-h", children: "NEXT PRACTICE" }) }), _jsx("div", { className: "panel next-practice", children: loading ? (_jsx("p", { className: "micro", children: "READING YOUR SESSIONS\u2026" })) : (_jsxs(_Fragment, { children: [_jsx("h3", { children: rec?.recommendation ?? analysis.recommendation }), _jsx("p", { className: "evidence", children: analysis.rationale }), analysis.pattern && (_jsxs("p", { className: "evidence", style: { marginTop: 8 }, children: ["Pattern: ", _jsx("b", { children: analysis.pattern.replace(/_/g, ' ') }), analysis.scenario ? ` · ${SCENARIO_LABELS[analysis.scenario]}` : '', " \u00B7 confidence ", analysis.confidence.toFixed(2)] })), _jsx("div", { className: "row", style: { marginTop: 20 }, children: _jsxs(Link, { className: "btn btn-primary btn-sm", to: `/app/speech${analysis.scenario ? `?scenario=${analysis.scenario}` : ''}`, children: ["Practise now ", _jsx("span", { className: "arrow", children: "\u2192" })] }) })] })) })] }), _jsxs("section", { "aria-labelledby": "progress-h", children: [_jsxs("div", { className: "section-head", children: [_jsx("p", { className: "overline", id: "progress-h", children: "YOUR PROGRESS" }), _jsx(Link, { className: "micro", to: "/app/speech/history", children: "ALL SESSIONS \u2192" })] }), _jsxs("div", { className: "panel-grid", children: [_jsxs("div", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsx("h3", { children: "Recent speech sessions" }) }), speech.length === 0 ? (_jsx("p", { className: "empty-state", children: "No sessions yet \u2014 your first practice will appear here." })) : (_jsx("div", { className: "session-list", children: speech.slice(0, 4).map(s => (_jsxs(Link, { className: "session-row", to: `/app/speech/history/${s.id}`, children: [_jsxs("div", { children: [_jsx("span", { className: "chip", children: SCENARIO_LABELS[s.scenario] }), _jsx("p", { className: "when", style: { marginTop: 8 }, children: relative(s.created_at) })] }), _jsxs("div", { className: "stats", children: [_jsxs("span", { children: [_jsx("b", { children: Math.round(s.words_per_minute) }), " WPM"] }), _jsxs("span", { children: [_jsx("b", { children: s.pause_count }), " PAUSES"] }), _jsxs("span", { children: [_jsx("b", { children: s.repetition_count }), " REPEATS"] }), _jsxs("span", { children: [_jsx("b", { children: s.filler_count }), " FILLERS"] })] }), _jsx("span", { className: "arrow", "aria-hidden": "true", children: "\u2192" })] }, s.id))) }))] }), _jsxs("div", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsx("h3", { children: "Activity" }) }), _jsx("p", { className: "evidence", children: "Speech sessions per week, last six weeks." }), _jsx("div", { className: "activity", "aria-hidden": "true", children: activity.map((count, i) => (_jsxs("div", { className: "wk", children: [_jsx("div", { className: "bar-fill", style: { height: `${Math.round((count / maxWeek) * 46)}px` } }), _jsx("span", { children: count })] }, i))) }), _jsxs("p", { className: "micro", style: { marginTop: 14 }, children: [speech.length, " SPEECH \u00B7 ", signs.length, " SIGN SESSION", signs.length === 1 ? '' : 'S'] })] })] })] })] }));
}
