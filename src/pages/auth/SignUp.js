import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout';
import { useAuth, validateCredentials } from '../../services/authService';
export default function SignUp() {
    const { signUp, mode } = useAuth();
    const navigate = useNavigate();
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [busy, setBusy] = useState(false);
    async function onSubmit(e) {
        e.preventDefault();
        setError(null);
        setNotice(null);
        const invalid = validateCredentials(email, password);
        if (invalid) {
            setError(invalid);
            return;
        }
        setBusy(true);
        const res = await signUp(email, password, displayName);
        setBusy(false);
        if (!res.ok) {
            setError(res.error ?? 'That did not work. Try again.');
            return;
        }
        if (res.needsConfirmation) {
            setNotice('Check your inbox to confirm the address, then sign in.');
            return;
        }
        navigate('/dashboard', { replace: true });
    }
    return (_jsx(AuthLayout, { overline: "CREATE ACCOUNT", title: "Start where", accent: "you are.", lede: "InSign learns from your sessions. Nothing is stored until you save a session yourself.", footer: _jsxs("p", { className: "micro", children: ["ALREADY HAVE AN ACCOUNT? ", _jsx(Link, { to: "/auth/signin", children: "SIGN IN" })] }), children: _jsxs("form", { className: "form", onSubmit: onSubmit, noValidate: true, children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "NAME" }), _jsx("input", { type: "text", name: "displayName", autoComplete: "name", value: displayName, onChange: e => setDisplayName(e.target.value), placeholder: "What should we call you?" })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "EMAIL" }), _jsx("input", { type: "email", name: "email", autoComplete: "email", value: email, onChange: e => setEmail(e.target.value), required: true, "aria-invalid": !!error, placeholder: "you@example.com" })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "PASSWORD" }), _jsx("input", { type: "password", name: "password", autoComplete: "new-password", value: password, onChange: e => setPassword(e.target.value), required: true, "aria-invalid": !!error }), _jsx("span", { className: "field-hint micro", children: "AT LEAST 6 CHARACTERS" })] }), error && _jsx("p", { className: "form-error", role: "alert", children: error }), notice && _jsx("p", { className: "form-notice", role: "status", children: notice }), _jsxs("button", { className: "btn btn-primary", type: "submit", disabled: busy, children: [busy ? 'Creating…' : 'Create account', " ", _jsx("span", { className: "arrow", children: "\u2192" })] }), mode === 'local' && (_jsx("p", { className: "micro form-hint", children: "LOCAL DEMO MODE \u00B7 ACCOUNTS LIVE IN THIS BROWSER ONLY" }))] }) }));
}
