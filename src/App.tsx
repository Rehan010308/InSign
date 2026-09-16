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
  if (typeof window !== 'undefined' && pathname !== '/') window.scrollTo(0, 0);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth/signin" element={<SignIn />} />
        <Route path="/auth/signup" element={<SignUp />} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/app/speech" element={<SpeechPractice />} />
          <Route path="/app/speech/history" element={<SpeechHistory />} />
          <Route path="/app/speech/history/:id" element={<SpeechSessionDetail />} />
          <Route
            path="/app/sign"
            element={
              <Suspense fallback={<div className="app-loading micro">LOADING SIGN TRANSLATOR…</div>}>
                <SignTranslate />
              </Suspense>
            }
          />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="/app" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
