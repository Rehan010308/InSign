import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
const STORAGE_KEY = 'insign-theme';
function readInitial() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark')
            return saved;
    }
    catch {
        /* storage blocked — fall through to the default */
    }
    const attr = document.documentElement.dataset.theme;
    return attr === 'light' ? 'light' : 'dark';
}
const Ctx = createContext(null);
export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(readInitial);
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        }
        catch {
            /* ignore */
        }
        // The background canvas listens for this and crossfades its colors.
        document.dispatchEvent(new CustomEvent('insign:theme', { detail: theme }));
    }, [theme]);
    const setTheme = useCallback((t) => setThemeState(t), []);
    const toggle = useCallback(() => setThemeState(t => (t === 'light' ? 'dark' : 'light')), []);
    return _jsx(Ctx.Provider, { value: { theme, setTheme, toggle }, children: children });
}
export function useTheme() {
    const v = useContext(Ctx);
    if (!v)
        throw new Error('useTheme must be used inside ThemeProvider');
    return v;
}
