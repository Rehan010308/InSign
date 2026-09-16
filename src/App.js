import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import RequireAuth from './components/RequireAuth';
import AppShell from './components/AppShell';
import SignIn from './pages/auth/SignIn';
import SignUp from './pages/auth/SignUp';
import Dashboard from './pages/Dashboard';
import SpeechPractice from './pages/SpeechPractice';
import SpeechHistory from './pages/SpeechHistory';
import SpeechSessionDetail from './pages/SpeechSessionDetail';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
// The sign feature pulls in MediaPipe; keep it off the landing bundle.
const SignTranslate = lazy(() => import('./pages/SignTranslate'));
function ScrollToTop() {
    const { pathname } = useLocation();
    if (typeof window !== 'undefined' && pathname !== '/')
        window.scrollTo(0, 0);
    return null;
}
export default function App() {
    return (_jsxs(_Fragment, { children: [_jsx(ScrollToTop, {}), _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Landing, {}) }), _jsx(Route, { path: "/auth/signin", element: _jsx(SignIn, {}) }), _jsx(Route, { path: "/auth/signup", element: _jsx(SignUp, {}) }), _jsxs(Route, { element: _jsx(RequireAuth, { children: _jsx(AppShell, {}) }), children: [_jsx(Route, { path: "/dashboard", element: _jsx(Dashboard, {}) }), _jsx(Route, { path: "/app/speech", element: _jsx(SpeechPractice, {}) }), _jsx(Route, { path: "/app/speech/history", element: _jsx(SpeechHistory, {}) }), _jsx(Route, { path: "/app/speech/history/:id", element: _jsx(SpeechSessionDetail, {}) }), _jsx(Route, { path: "/app/sign", element: _jsx(Suspense, { fallback: _jsx("div", { className: "app-loading micro", children: "LOADING SIGN TRANSLATOR\u2026" }), children: _jsx(SignTranslate, {}) }) }), _jsx(Route, { path: "/settings", element: _jsx(Settings, {}) })] }), _jsx(Route, { path: "/app", element: _jsx(Navigate, { to: "/dashboard", replace: true }) }), _jsx(Route, { path: "*", element: _jsx(NotFound, {}) })] })] }));
}
