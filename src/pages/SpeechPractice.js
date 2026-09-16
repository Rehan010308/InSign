import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ScenarioPicker from '../features/speech/ScenarioPicker';
import LiveTranscript from '../features/speech/LiveTranscript';
import MetricTiles from '../features/speech/MetricTiles';
import { useSpeechRecognition } from '../lib/speech/useSpeechRecognition';
import { computeMetrics, metricsFromTypedTranscript, } from '../lib/speech/metrics';
import { useAuth } from '../services/authService';
import { getPreferences, listSpeechSessions, saveSpeechSession, setOpenRecommendation, upsertPattern, } from '../services/sessionService';
import { detectPattern } from '../services/personalizationEngine';
import { DEFAULT_FILLER_WORDS, SCENARIOS, SCENARIO_LABELS, } from '../types';
function formatClock(ms) {
    const total = Math.floor(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
export default function SpeechPractice() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const recog = useSpeechRecognition();
    const [prefs, setPrefs] = useState(null);
    const [phase, setPhase] = useState('pick');
    const [mode, setMode] = useState(recog.supported ? 'mic' : 'manual');
    const [scenario, setScenario] = useState(() => {
        const q = params.get('scenario');
        return SCENARIOS.includes(q) ? q : null;
    });
    const [elapsed, setElapsed] = useState(0);
    const startedAt = useRef(0);
    const tick = useRef(null);
    const [manualText, setManualText] = useState('');
    const [manualSeconds, setManualSeconds] = useState(60);
    const [reviewMetrics, setReviewMetrics] = useState(null);
    const [reviewTranscript, setReviewTranscript] = useState('');
    const [saveError, setSaveError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [showPrivacy, setShowPrivacy] = useState(false);
    const fillerWords = prefs?.filler_words ?? DEFAULT_FILLER_WORDS;
    useEffect(() => {
        if (!user)
            return;
        let alive = true;
        getPreferences(user.id).then(p => { if (alive)
            setPrefs(p); });
        return () => { alive = false; };
    }, [user]);
    // Release the microphone if the user navigates away mid-session.
    useEffect(() => () => {
        recog.stop();
        if (tick.current !== null)
            clearInterval(tick.current);
    }, [recog]);
    const liveMetrics = useMemo(() => computeMetrics(recog.finalTranscript, recog.events, elapsed || 1, fillerWords), [recog.finalTranscript, recog.events, elapsed, fillerWords]);
    const startTimer = useCallback(() => {
        startedAt.current = performance.now();
        setElapsed(0);
        if (tick.current !== null)
            clearInterval(tick.current);
        tick.current = window.setInterval(() => {
            setElapsed(performance.now() - startedAt.current);
        }, 200);
    }, []);
    const stopTimer = useCallback(() => {
        if (tick.current !== null) {
            clearInterval(tick.current);
            tick.current = null;
        }
        return performance.now() - startedAt.current;
    }, []);
    function beginSession() {
        setSaveError(null);
        recog.reset();
        startTimer();
        setPhase('practice');
        if (mode === 'mic')
            recog.start();
    }
    function stopSession() {
        const duration = stopTimer();
        if (mode === 'mic') {
            recog.stop();
            const metrics = computeMetrics(recog.finalTranscript, recog.events, duration, fillerWords);
            setReviewMetrics(metrics);
            setReviewTranscript(recog.finalTranscript.trim());
        }
        else {
            const ms = Math.max(1000, manualSeconds * 1000);
            setReviewMetrics(metricsFromTypedTranscript(manualText, ms, fillerWords));
            setReviewTranscript(manualText.trim());
        }
        setPhase('review');
    }
    function cancelSession() {
        stopTimer();
        recog.stop();
        recog.reset();
        setManualText('');
        setElapsed(0);
        setPhase('pick');
    }
    async function save() {
        if (!user || !scenario || !reviewMetrics)
            return;
        if (!reviewTranscript.trim()) {
            setSaveError('There is nothing to save yet — record or type a transcript first.');
            return;
        }
        setSaving(true);
        setSaveError(null);
        try {
            const storeTranscripts = prefs?.store_transcripts ?? true;
            await saveSpeechSession(user.id, {
                scenario,
                transcript: storeTranscripts ? reviewTranscript : null,
                duration_ms: reviewMetrics.durationMs,
                words_per_minute: reviewMetrics.wordsPerMinute,
                pause_count: reviewMetrics.pauseCount,
                repetition_count: reviewMetrics.repetitionCount,
                filler_count: reviewMetrics.fillerCount,
            });
            // Re-run personalization over the real history, including this session.
            const history = await listSpeechSessions(user.id);
            const result = detectPattern(history);
            if (result.pattern) {
                const pattern = await upsertPattern(user.id, {
                    pattern_key: result.pattern,
                    scenario: result.scenario,
                    confidence: result.confidence,
                    evidence: result.evidence,
                });
                await setOpenRecommendation(user.id, {
                    recommendation: result.recommendation,
                    scenario: result.scenario,
                    source_pattern_id: pattern.id,
                });
            }
            else {
                await setOpenRecommendation(user.id, {
                    recommendation: result.recommendation,
                    scenario: null,
                    source_pattern_id: null,
                });
            }
            navigate('/app/speech/history?saved=1');
        }
        catch (e) {
            setSaveError(e instanceof Error ? e.message : 'The session could not be saved. Try again.');
            setSaving(false);
        }
    }
    /* ----------------------------------------------------------- rendering */
    if (phase === 'pick') {
        return (_jsxs("div", { className: "wrap stack-lg", children: [_jsxs("header", { children: [_jsx("p", { className: "overline", children: "SPEECH COMPANION" }), _jsxs("h1", { className: "statement-sm", children: ["What are you practising ", _jsx("em", { className: "serif", children: "today" }), "?"] }), _jsx("p", { className: "app-hint", children: "Pick a scenario. InSign observes how you speak \u2014 pace, pauses, repetitions, fillers \u2014 and remembers the shape of it, not a score." })] }), _jsx(ScenarioPicker, { value: scenario, onChange: setScenario }), !recog.supported && (_jsxs("div", { className: "notice", role: "status", children: [_jsx("strong", { children: "Live speech recognition needs Chrome or Edge." }), " In this browser you can still run the full pipeline by typing your transcript \u2014 the metrics are computed exactly the same way."] })), _jsxs("div", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsx("h3", { children: "How you want to practise" }) }), _jsxs("div", { className: "row", children: [_jsx("button", { type: "button", className: mode === 'mic' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm', onClick: () => setMode('mic'), disabled: !recog.supported, "aria-pressed": mode === 'mic', children: "Speak out loud" }), _jsx("button", { type: "button", className: mode === 'manual' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm', onClick: () => setMode('manual'), "aria-pressed": mode === 'manual', children: "Type my transcript" })] }), _jsx("button", { type: "button", className: "link-btn micro", style: { marginTop: 18 }, "aria-expanded": showPrivacy, onClick: () => setShowPrivacy(v => !v), children: "HOW SPEECH IS PROCESSED" }), showPrivacy && (_jsx("div", { className: "notice", style: { marginTop: 12 }, children: "Browser speech recognition may send your audio to your browser vendor's service \u2014 that part is not local, and we will not pretend otherwise. Everything after the transcript (pace, pauses, repetitions, fillers, pattern detection and the practice recommendation) runs locally in this page. Nothing is stored until you press Save, and your transcript is only kept if \"store transcripts\" is on in Settings." }))] }), _jsx("div", { className: "row", children: _jsxs("button", { type: "button", className: "btn btn-primary", disabled: !scenario, onClick: beginSession, "data-testid": "begin-session", children: [scenario ? `Start ${SCENARIO_LABELS[scenario].toLowerCase()} practice` : 'Choose a scenario first', _jsx("span", { className: "arrow", children: "\u2192" })] }) })] }));
    }
    if (phase === 'practice') {
        const listening = recog.state === 'listening';
        return (_jsxs("div", { className: "wrap stack-lg", children: [_jsxs("header", { className: "section-head", children: [_jsxs("div", { children: [_jsxs("p", { className: "overline", children: [SCENARIO_LABELS[scenario].toUpperCase(), " PRACTICE"] }), _jsx("h1", { className: "statement-sm", children: "Take your time." })] }), _jsx("p", { className: "timer", "data-testid": "timer", "aria-label": "Elapsed time", children: formatClock(elapsed) })] }), _jsxs("div", { className: "practice-stage", children: [_jsxs("div", { className: "practice-controls", children: [_jsx("div", { className: `mic-orb${listening ? ' live' : ''}`, "aria-hidden": "true", children: _jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", children: [_jsx("rect", { x: "9", y: "2", width: "6", height: "12", rx: "3" }), _jsx("path", { d: "M5 10a7 7 0 0 0 14 0M12 17v5" })] }) }), _jsxs("span", { className: `state-chip${listening ? ' live' : recog.error ? ' warn' : ''}`, role: "status", "data-testid": "speech-state", children: [_jsx("i", {}), mode === 'manual'
                                            ? 'TYPED TRANSCRIPT'
                                            : recog.state === 'requesting_permission' ? 'ASKING FOR THE MICROPHONE'
                                                : recog.state === 'listening' ? 'LISTENING'
                                                    : recog.state === 'error' ? 'STOPPED'
                                                        : 'READY'] }), recog.reconnected && (_jsxs("span", { className: "state-chip", role: "status", children: [_jsx("i", {}), "RECONNECTED"] })), recog.silent && listening && (_jsxs("span", { className: "state-chip warn", role: "status", children: [_jsx("i", {}), "NOTHING HEARD YET \u2014 STILL LISTENING"] })), _jsxs("div", { className: "row", style: { justifyContent: 'center' }, children: [_jsx("button", { type: "button", className: "btn btn-primary btn-sm", onClick: stopSession, "data-testid": "stop-session", children: "Stop" }), _jsx("button", { type: "button", className: "btn btn-secondary btn-sm", onClick: cancelSession, children: "Cancel" })] })] }), _jsx("div", { children: mode === 'mic' ? (_jsxs(_Fragment, { children: [_jsx(LiveTranscript, { final: recog.finalTranscript, interim: recog.interim, listening: listening }), recog.error && (_jsxs("div", { className: "notice", style: { marginTop: 14 }, role: "alert", children: [recog.error.message, !recog.error.recoverable && (_jsxs(_Fragment, { children: [' ', _jsx("button", { type: "button", className: "link-btn micro", onClick: () => setMode('manual'), children: "SWITCH TO TYPED TRANSCRIPT" })] }))] })), _jsx(MetricTiles, { metrics: liveMetrics })] })) : (_jsxs(_Fragment, { children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "YOUR TRANSCRIPT" }), _jsx("textarea", { value: manualText, onChange: e => setManualText(e.target.value), placeholder: "Type what you said. Mark a pause with \u2026 or \u2014.", "data-testid": "manual-transcript" }), _jsx("span", { className: "field-hint micro", children: "PAUSES ARE COUNTED FROM THE MARKS YOU TYPE (\u2026 OR \u2014), SINCE TYPED TEXT CARRIES NO AUDIO TIMING" })] }), _jsxs("label", { className: "field", style: { maxWidth: 240 }, children: [_jsx("span", { className: "field-label", children: "HOW LONG DID IT TAKE? (SECONDS)" }), _jsx("input", { type: "number", min: 1, value: manualSeconds, onChange: e => setManualSeconds(Math.max(1, Number(e.target.value) || 1)), "data-testid": "manual-seconds" })] }), _jsx(MetricTiles, { metrics: metricsFromTypedTranscript(manualText, Math.max(1000, manualSeconds * 1000), fillerWords) })] })) })] })] }));
    }
    /* review */
    const m = reviewMetrics;
    const storeTranscripts = prefs?.store_transcripts ?? true;
    return (_jsxs("div", { className: "wrap stack-lg", children: [_jsxs("header", { children: [_jsxs("p", { className: "overline", children: ["REVIEW \u00B7 ", SCENARIO_LABELS[scenario].toUpperCase()] }), _jsxs("h1", { className: "statement-sm", children: ["Here's what that ", _jsx("em", { className: "serif", children: "looked" }), " like."] }), _jsxs("p", { className: "app-hint", children: ["Observations from ", formatClock(m.durationMs), " of practice. Nothing is stored until you save."] })] }), _jsx(MetricTiles, { metrics: m }), _jsxs("div", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsx("h3", { children: "Transcript" }) }), reviewTranscript ? (_jsx("p", { style: { fontSize: 16, lineHeight: 1.85 }, "data-testid": "review-transcript", children: reviewTranscript })) : (_jsx("p", { className: "empty-state", children: "Nothing was captured. Try again, or type the transcript instead." })), !storeTranscripts && (_jsx("p", { className: "micro", style: { marginTop: 14 }, children: "STORE TRANSCRIPTS IS OFF \u2014 THE METRICS WILL BE SAVED, THE TRANSCRIPT WILL NOT" }))] }), saveError && _jsx("p", { className: "form-error", role: "alert", children: saveError }), _jsxs("div", { className: "row", children: [_jsxs("button", { type: "button", className: "btn btn-primary", onClick: save, disabled: saving, "data-testid": "save-session", children: [saving ? 'Saving…' : 'Save this session', " ", _jsx("span", { className: "arrow", children: "\u2192" })] }), _jsx("button", { type: "button", className: "btn btn-secondary", onClick: () => { setPhase('pick'); recog.reset(); setManualText(''); }, children: "Discard" })] })] }));
}
