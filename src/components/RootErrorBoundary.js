import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from 'react';
/**
 * Keeps a crash inside one feature from taking the app shell with it.
 * The top-level instance renders in the landing design language.
 */
export default class RootErrorBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        // Surfaced in the console for the developer; never shown raw to the user.
        console.error(`[InSign${this.props.label ? ' · ' + this.props.label : ''}]`, error, info.componentStack);
    }
    reset = () => this.setState({ error: null });
    render() {
        const { error } = this.state;
        if (!error)
            return this.props.children;
        if (this.props.fallback)
            return this.props.fallback(error, this.reset);
        return (_jsx("main", { className: "page app-page", id: "main", children: _jsxs("div", { className: "wrap-narrow app-error-page", children: [_jsx("p", { className: "overline", children: "SOMETHING WENT WRONG" }), _jsx("h1", { className: "statement-sm", children: "The page stopped responding." }), _jsxs("p", { className: "lede", children: ["Reloading usually fixes it. If it keeps happening, send the details to", ' ', _jsx("a", { href: "mailto:rehan.badar0103@gmail.com", children: "rehan.badar0103@gmail.com" }), "."] }), _jsxs("div", { className: "row", style: { marginTop: 28 }, children: [_jsx("button", { type: "button", className: "btn btn-primary", onClick: () => window.location.reload(), children: "Reload" }), _jsx("a", { className: "btn btn-secondary", href: "/", children: "Back to the landing page" })] }), _jsx("p", { className: "micro app-error-detail", children: error.message })] }) }));
    }
}
