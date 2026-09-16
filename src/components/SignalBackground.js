import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { startSignalBackground } from '../lib/landing/signalBackground';
/**
 * The drifting signal lines behind the landing page.
 * Mounted only on the landing route — the app routes stay calm.
 */
export default function SignalBackground() {
    const ref = useRef(null);
    useEffect(() => {
        if (!ref.current)
            return;
        return startSignalBackground(ref.current);
    }, []);
    return _jsx("canvas", { id: "bg", ref: ref, "aria-hidden": "true" });
}
