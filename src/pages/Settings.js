import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useAuth } from '../services/authService';
import { getPreferences, savePreferences, saveDisplayName } from '../services/sessionService';
import { useTheme } from '../hooks/useTheme';
import { DEFAULT_FILLER_WORDS } from '../types';
export default function Settings() {
    const { user, refreshDisplayName, mode } = useAuth();
    const { theme, setTheme } = useTheme();
    const [prefs, setPrefs] = useState(null);
    const [displayName, setDisplayName] = useState(user?.displayName ?? '');
    const [fillerText, setFillerText] = useState(DEFAULT_FILLER_WORDS.join(', '));
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!user)
            return;
        let alive = true;
        getPreferences(user.id).then(p => {
            if (!alive)
                return;
            setPrefs(p);
            setFillerText(p.filler_words.join(', '));
        });
        return () => { alive = false; };
    }, [user]);
    async function persist(patch) {
        if (!user)
            return;
        setBusy(true);
        const next = await savePreferences(user.id, patch);
        setPrefs(next);
        setBusy(false);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
    }
    async function saveName() {
        if (!user)
            return;
        setBusy(true);
        await saveDisplayName(user.id, displayName.trim());
        refreshDisplayName(displayName.trim());
        setBusy(false);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
    }
    if (!prefs)
        return _jsx("div", { className: "wrap", children: _jsx("p", { className: "micro", children: "LOADING SETTINGS\u2026" }) });
    return (_jsxs("div", { className: "wrap stack-lg", children: [_jsxs("header", { children: [_jsx("p", { className: "overline", children: "SETTINGS" }), _jsxs("h1", { className: "statement-sm", children: ["Tune it to ", _jsx("em", { className: "serif", children: "you" }), "."] }), _jsxs("p", { className: "app-hint", children: ["Signed in as ", user?.email, ". ", mode === 'local' ? 'Local demo mode — these preferences live in this browser.' : ''] })] }), saved && _jsx("p", { className: "form-notice", role: "status", children: "Saved." }), _jsxs("div", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsx("h3", { children: "Display name" }) }), _jsxs("div", { className: "row", style: { alignItems: 'flex-end', gap: 14 }, children: [_jsxs("label", { className: "field", style: { flex: '1 1 260px' }, children: [_jsx("span", { className: "field-label", children: "NAME" }), _jsx("input", { type: "text", value: displayName, onChange: e => setDisplayName(e.target.value) })] }), _jsx("button", { type: "button", className: "btn btn-secondary btn-sm", onClick: saveName, disabled: busy, children: "Save" })] })] }), _jsxs("div", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsx("h3", { children: "Transcripts" }) }), _jsxs("label", { className: "switch", children: [_jsxs("span", { className: "switch-copy", children: [_jsx("h3", { children: "Store transcripts" }), _jsx("p", { children: "When this is off, sessions still save their metrics but the words are dropped before storage \u2014 the history shows \"transcript not stored\"." })] }), _jsx("input", { type: "checkbox", checked: prefs.store_transcripts, onChange: e => persist({ store_transcripts: e.target.checked }), "data-testid": "store-transcripts" })] })] }), _jsxs("div", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsx("h3", { children: "Filler words" }) }), _jsx("p", { className: "app-hint", style: { marginBottom: 14 }, children: "These are the words counted as fillers in your sessions. Comma separated; multi-word phrases like \"you know\" work too." }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "YOUR LIST" }), _jsx("input", { type: "text", value: fillerText, onChange: e => setFillerText(e.target.value), onBlur: () => persist({
                                    filler_words: fillerText.split(',').map(w => w.trim()).filter(Boolean),
                                }), "data-testid": "filler-words" })] })] }), _jsxs("div", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsx("h3", { children: "Sign confidence threshold" }) }), _jsx("p", { className: "app-hint", style: { marginBottom: 14 }, children: "A sign is only shown when the classifier scores it above this. Lower it to see more guesses; raise it to see only confident matches." }), _jsx("input", { type: "range", min: 0.5, max: 0.95, step: 0.05, value: prefs.sign_confidence_threshold, onChange: e => persist({ sign_confidence_threshold: Number(e.target.value) }), "aria-label": "Sign confidence threshold", "data-testid": "confidence-threshold" }), _jsxs("p", { className: "micro", style: { marginTop: 10 }, children: ["CURRENT: ", prefs.sign_confidence_threshold.toFixed(2)] })] }), _jsxs("div", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsx("h3", { children: "Theme" }) }), _jsxs("div", { className: "row", children: [_jsx("button", { type: "button", className: theme === 'dark' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm', "aria-pressed": theme === 'dark', onClick: () => { setTheme('dark'); persist({ theme: 'dark' }); }, children: "Dark" }), _jsx("button", { type: "button", className: theme === 'light' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm', "aria-pressed": theme === 'light', onClick: () => { setTheme('light'); persist({ theme: 'light' }); }, children: "Light" })] })] })] }));
}
