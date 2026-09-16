import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { supabase, supabaseStatus, type DataMode } from './supabaseClient';
import { hashPassword, localStore, newId } from './localStore';

export interface AppUser {
  id: string;
  email: string;
  displayName: string | null;
}

interface LocalUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  created_at: string;
}

const LOCAL_USERS = 'users';
const LOCAL_SESSION = 'session';

export interface AuthResult {
  ok: boolean;
  /** Field-level message for inline, calm form errors. */
  error?: string;
  /** Set when the account exists but still needs email confirmation. */
  needsConfirmation?: boolean;
}

interface AuthCtx {
  user: AppUser | null;
  loading: boolean;
  mode: DataMode;
  modeReason: string | null;
  signUp: (email: string, password: string, displayName: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  refreshDisplayName: (name: string) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateCredentials(email: string, password: string): string | null {
  if (!email.trim()) return 'Enter the email address you want to use.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'That email address looks incomplete.';
  if (password.length < 6) return 'That password needs at least 6 characters.';
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        const s = data.session;
        setUser(s ? {
          id: s.user.id,
          email: s.user.email ?? '',
          displayName: (s.user.user_metadata?.display_name as string | undefined) ?? null,
        } : null);
        setLoading(false);
      }).catch(() => { if (!cancelled) setLoading(false); });

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session ? {
          id: session.user.id,
          email: session.user.email ?? '',
          displayName: (session.user.user_metadata?.display_name as string | undefined) ?? null,
        } : null);
      });
      return () => { cancelled = true; sub.subscription.unsubscribe(); };
    }

    // local demo mode
    const sessionUserId = localStore.getSingleton<string>(LOCAL_SESSION);
    if (sessionUserId) {
      const rec = localStore.all<LocalUserRecord>(LOCAL_USERS).find(u => u.id === sessionUserId);
      if (rec) setUser({ id: rec.id, email: rec.email, displayName: rec.displayName });
    }
    setLoading(false);
    return () => { cancelled = true; };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string): Promise<AuthResult> => {
    const invalid = validateCredentials(email, password);
    if (invalid) return { ok: false, error: invalid };
    const mail = normalizeEmail(email);

    if (supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: mail,
        password,
        options: { data: { display_name: displayName.trim() || mail.split('@')[0] } },
      });
      if (error) return { ok: false, error: friendlySupabaseError(error.message) };
      if (!data.session) return { ok: true, needsConfirmation: true };
      return { ok: true };
    }

    const users = localStore.all<LocalUserRecord>(LOCAL_USERS);
    if (users.some(u => u.email === mail)) {
      return { ok: false, error: 'An account with that email already exists here. Try signing in.' };
    }
    const rec: LocalUserRecord = {
      id: newId(),
      email: mail,
      passwordHash: await hashPassword(password),
      displayName: displayName.trim() || mail.split('@')[0],
      created_at: new Date().toISOString(),
    };
    localStore.insert(LOCAL_USERS, rec);
    localStore.setSingleton(LOCAL_SESSION, rec.id);
    setUser({ id: rec.id, email: rec.email, displayName: rec.displayName });
    return { ok: true };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const mail = normalizeEmail(email);
    if (!mail || !password) return { ok: false, error: 'Enter your email and password to continue.' };

    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
      if (error) return { ok: false, error: friendlySupabaseError(error.message) };
      return { ok: true };
    }

    const rec = localStore.all<LocalUserRecord>(LOCAL_USERS).find(u => u.email === mail);
    if (!rec) return { ok: false, error: 'No account here with that email yet. Create one first.' };
    if (rec.passwordHash !== (await hashPassword(password))) {
      return { ok: false, error: "That password doesn't match this account." };
    }
    localStore.setSingleton(LOCAL_SESSION, rec.id);
    setUser({ id: rec.id, email: rec.email, displayName: rec.displayName });
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
      setUser(null);
      return;
    }
    localStore.setSingleton(LOCAL_SESSION, null);
    setUser(null);
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
        redirectTo: `${window.location.origin}/auth/signin`,
      });
      if (error) return { ok: false, error: friendlySupabaseError(error.message) };
      return { ok: true };
    }
    return {
      ok: false,
      error: 'Password reset needs the hosted Supabase project. In local demo mode, create a new account instead.',
    };
  }, []);

  const refreshDisplayName = useCallback((name: string) => {
    setUser(u => (u ? { ...u, displayName: name } : u));
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    user,
    loading,
    mode: supabaseStatus.mode,
    modeReason: supabaseStatus.reason,
    signUp,
    signIn,
    signOut,
    requestPasswordReset,
    refreshDisplayName,
  }), [user, loading, signUp, signIn, signOut, requestPasswordReset, refreshDisplayName]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function friendlySupabaseError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return "That email and password don't match an account.";
  if (m.includes('already registered')) return 'An account with that email already exists. Try signing in.';
  if (m.includes('password')) return 'That password needs at least 6 characters.';
  if (m.includes('email')) return 'That email address looks incomplete.';
  if (m.includes('fetch') || m.includes('network')) return "Can't reach the server right now. Check your connection and try again.";
  return message;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
