import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import ModeBanner from './ModeBanner';
import RootErrorBoundary from './RootErrorBoundary';
import { useAuth } from '../services/authService';
const LINKS = [
    { to: '/dashboard', label: 'DASHBOARD' },
    { to: '/app/speech', label: 'SPEECH' },
    { to: '/app/sign', label: 'SIGN' },
    { to: '/app/speech/history', label: 'HISTORY' },
    { to: '/settings', label: 'SETTINGS' },
];
export default function AppShell() {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    useEffect(() => {
        // The app routes stay calm: no signal background behind them.
        document.body.classList.add('in-app');
        return () => document.body.classList.remove('in-app');
    }, []);
    return (_jsxs(_Fragment, { children: [_jsx("a", { className: "skip", href: "#main", children: "Skip to content" }), _jsx("header", { id: "nav", className: "app-nav scrolled", children: _jsxs("div", { className: "wrap bar", children: [_jsxs(Link, { className: "brand", to: "/dashboard", children: [_jsx("span", { className: "mark", "aria-hidden": "true" }), "InSign"] }), _jsx("button", { type: "button", className: "app-menu-toggle", "aria-expanded": menuOpen, "aria-controls": "app-nav-links", onClick: () => setMenuOpen(o => !o), children: menuOpen ? 'CLOSE' : 'MENU' }), _jsxs("nav", { className: `nav-links app-links${menuOpen ? ' open' : ''}`, id: "app-nav-links", "aria-label": "Application", children: [LINKS.map(l => (_jsx(NavLink, { to: l.to, end: l.to === '/app/speech', className: ({ isActive }) => (isActive ? 'app-link active' : 'app-link'), onClick: () => setMenuOpen(false), children: l.label }, l.to))), _jsx(ThemeToggle, {}), _jsx("button", { type: "button", className: "btn btn-secondary btn-sm", onClick: async () => { await signOut(); navigate('/'); }, children: "Sign out" })] })] }) }), _jsxs("main", { id: "main", className: "page app-page", children: [_jsx(ModeBanner, {}), _jsx(RootErrorBoundary, { label: user?.email, children: _jsx(Outlet, {}) })] }), _jsx("footer", { className: "app-footer", children: _jsxs("div", { className: "wrap frow", children: [_jsx("p", { className: "ftag", children: "InSign \u2014 technology should adapt to how you communicate." }), _jsx("a", { className: "fmail", href: "mailto:rehan.badar0103@gmail.com", children: "REHAN.BADAR0103@GMAIL.COM" })] }) })] }));
}
