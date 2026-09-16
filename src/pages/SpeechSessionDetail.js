import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../services/authService';
import { getSpeechSession } from '../services/sessionService';
import { SCENARIO_LABELS } from '../types';
export default function SpeechSessionDetail() {
    const { id } = useParams();
    const { user } = useAuth();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!user || !id)
            return;
        let alive = true;
        getSpeechSession(user.id, id).then(s => {
            if (!alive)
                return;
            setSession(s);
            setLoading(false);
        });
        return () => { alive = false; };
    }, [user, id]);
    if (loading)
        return _jsx("div", { className: "wrap", children: _jsx("p", { className: "micro", children: "LOADING\u2026" }) });
    if (!session) {
        return (_jsxs("div", { className: "wrap stack", children: [_jsx("p", { className: "overline", children: "SESSION" }), _jsx("h1", { className: "statement-sm", children: "That session isn't here." }), _jsx("p", { className: "app-hint", children: "It may have been saved to a different account or browser." }), _jsx(Link, { className: "btn btn-secondary btn-sm", to: "/app/speech/history", children: "Back to history" })] }));
    }
    const seconds = Math.round(session.duration_ms / 1000);
    return (_jsxs("div", { className: "wrap stack-lg", children: [_jsxs("header", { children: [_jsxs("p", { className: "overline", children: [SCENARIO_LABELS[session.scenario].toUpperCase(), " SESSION"] }), _jsx("h1", { className: "statement-sm", children: new Date(session.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }), _jsxs("p", { className: "app-hint", children: [seconds, "s of practice."] })] }), _jsxs("div", { className: "metrics", children: [_jsxs("div", { className: "metric", children: [_jsx("h4", { children: "PACE" }), _jsx("p", { className: "val", children: Math.round(session.words_per_minute) }), _jsx("span", { className: "unit", children: "WORDS PER MINUTE" })] }), _jsxs("div", { className: "metric", children: [_jsx("h4", { children: "PAUSES" }), _jsx("p", { className: "val", children: session.pause_count }), _jsx("span", { className: "unit", children: "OBSERVED" })] }), _jsxs("div", { className: "metric", children: [_jsx("h4", { children: "REPETITIONS" }), _jsx("p", { className: "val", children: session.repetition_count }), _jsx("span", { className: "unit", children: "SOUNDS REVISITED" })] }), _jsxs("div", { className: "metric", children: [_jsx("h4", { children: "FILLERS" }), _jsx("p", { className: "val", children: session.filler_count }), _jsx("span", { className: "unit", children: "PATTERNS OF HESITATION" })] })] }), _jsxs("div", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsx("h3", { children: "Transcript" }) }), session.transcript ? (_jsx("p", { style: { fontSize: 16, lineHeight: 1.85 }, "data-testid": "detail-transcript", children: session.transcript })) : (_jsx("p", { className: "empty-state", "data-testid": "detail-transcript-redacted", children: "This transcript was not stored \u2014 \"store transcripts\" was off when the session was saved." }))] }), _jsx(Link, { className: "btn btn-secondary btn-sm", to: "/app/speech/history", children: "\u2190 Back to history" })] }));
}
