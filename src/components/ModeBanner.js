import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useAuth } from '../services/authService';
import { onOfflineChange } from '../services/sessionService';
/**
 * Always discloses which persistence path is live. The local demo store must
 * never be able to pass itself off as the real Supabase path.
 */
export default function ModeBanner() {
    const { mode, modeReason } = useAuth();
    const [offline, setOffline] = useState(false);
    useEffect(() => onOfflineChange(setOffline), []);
    if (mode === 'supabase' && !offline)
        return null;
    return (_jsx("div", { className: "wrap", children: _jsxs("div", { className: `mode-banner${offline ? ' offline' : ''}`, role: "status", children: [_jsx("span", { className: "badge badge-demo", children: offline ? 'OFFLINE' : 'LOCAL DEMO MODE' }), _jsx("p", { className: "micro", children: offline
                        ? 'Supabase is unreachable. Sessions are being saved in this browser and will be sent when the connection returns.'
                        : `Sessions are stored in this browser only. ${modeReason ?? ''}` })] }) }));
}
