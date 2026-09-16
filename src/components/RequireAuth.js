import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../services/authService';
export default function RequireAuth({ children }) {
    const { user, loading } = useAuth();
    const location = useLocation();
    if (loading) {
        return (_jsx("div", { className: "app-loading micro", role: "status", children: "CHECKING YOUR SESSION\u2026" }));
    }
    if (!user) {
        const next = encodeURIComponent(location.pathname + location.search);
        return _jsx(Navigate, { to: `/auth/signin?next=${next}`, replace: true });
    }
    return _jsx(_Fragment, { children: children });
}
