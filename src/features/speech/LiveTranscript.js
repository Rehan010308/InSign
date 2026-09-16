import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
export default function LiveTranscript({ final, interim, listening, }) {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        if (el)
            el.scrollTop = el.scrollHeight;
    }, [final, interim]);
    return (_jsx("div", { className: "transcript", ref: ref, "aria-live": "polite", "aria-atomic": "false", "aria-label": "Live transcript", "data-testid": "transcript", children: final || interim ? (_jsxs("p", { children: [final, interim && _jsxs("span", { className: "interim", children: [" ", interim] })] })) : (_jsx("p", { className: "placeholder", children: listening
                ? 'Listening — start speaking whenever you are ready.'
                : 'Your words will appear here as you speak.' })) }));
}
