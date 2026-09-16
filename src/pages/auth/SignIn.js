import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout';
import { useAuth } from '../../services/authService';
export default function SignIn() {
    const { signIn, requestPasswordReset, mode } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const next = params.get('next') || '/dashboard';
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [busy, setBusy] = useState(false);
    async function onSubmit(e) {
        e.preventDefault();
        setError(null);
        setNotice(null);
        setBusy(true);
        const res = await signIn(email, password);
        setBusy(false);
        if (!res.ok) {
            setError(res.error ?? 'That did not work. Try again.');
            return;
        }
        navigate(decodeURIComponent(next), { replace: true });
    }
    async function onReset() {
        setError(null);
        const res = await requestPasswordReset(email);
        if (res.ok)
            setNotice('If that email has an account, a reset link is on its way.');
        else
            setError(res.error ?? null);
    }
    return (_jsx(AuthLayout, { overline: "SIGN IN", title: "Welcome", accent: "back.", lede: "Your sessions, patterns and practice recommendations are waiting.", footer: _jsxs("p", { className: "micro", children: ["NEW HERE? ", _jsx(Link, { to: "/auth/signup", children: "CREATE AN ACCOUNT" })] }), children: _jsxs("form", { className: "form", onSubmit: onSubmit, noValidate: true, children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "EMAIL" }), _jsx("input", { type: "email", name: "email", autoComplete: "email", value: email, onChange: e => setEmail(e.target.value), required: true, "aria-invalid": !!error, placeholder: "you@example.com" })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "PASSWORD" }), _jsx("input", { type: "password", name: "password", autoComplete: "current-password", value: password, onChange: e => setPassword(e.target.value), required: true, "aria-invalid": !!error })] }), error && _jsx("p", { className: "form-error", role: "alert", children: error }), notice && _jsx("p", { className: "form-notice", role: "status", children: notice }), _jsxs("button", { className: "btn btn-primary", type: "submit", disabled: busy, children: [busy ? 'Signing in…' : 'Sign in', " ", _jsx("span", { className: "arrow", children: "\u2192" })] }), _jsx("button", { type: "button", className: "link-btn micro", onClick: onReset, children: "FORGOT YOUR PASSWORD?" }), mode === 'local' && (_jsx("p", { className: "micro form-hint", children: "LOCAL DEMO MODE \u00B7 ACCOUNTS LIVE IN THIS BROWSER ONLY" }))] }) }));
}
