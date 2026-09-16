import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../services/authService';
export default function LandingNav() {
    const { user } = useAuth();
    return (_jsx("header", { id: "nav", children: _jsxs("div", { className: "wrap bar", children: [_jsxs("a", { className: "brand", href: "#hero", children: [_jsx("span", { className: "mark", "aria-hidden": "true" }), "InSign"] }), _jsxs("nav", { className: "nav-links", "aria-label": "Primary", children: [_jsx("a", { href: "#speech", children: "SPEECH" }), _jsx("a", { href: "#sign", children: "SIGN" }), _jsx("a", { href: "#philosophy", children: "PHILOSOPHY" }), _jsx("a", { href: "#contact", children: "CONTACT" }), _jsx(ThemeToggle, {}), _jsxs(Link, { className: "btn btn-primary btn-sm magnetic", to: user ? '/dashboard' : '/auth/signup', children: [user ? 'Open InSign' : 'Try InSign', " ", _jsx("span", { className: "arrow", children: "\u2192" })] })] })] }) }));
}
