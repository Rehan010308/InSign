import { createClient } from '@supabase/supabase-js';
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
function decodeRole(key) {
    // Supabase keys are JWTs; the payload carries the role. We only look at it to
    // refuse a service-role key, which must never reach a browser bundle.
    const parts = key.split('.');
    if (parts.length !== 3)
        return null;
    try {
        const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(json);
        return payload.role ?? null;
    }
    catch {
        return null;
    }
}
function evaluate() {
    if (!url || !anonKey) {
        return {
            mode: 'local',
            reason: 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set — see .env.example.',
        };
    }
    if (anonKey.startsWith('service_role') || decodeRole(anonKey) === 'service_role') {
        return {
            mode: 'local',
            reason: 'That key is a service-role key. Only the public anon key may be used in the browser.',
        };
    }
    if (!/^https?:\/\//.test(url)) {
        return { mode: 'local', reason: 'VITE_SUPABASE_URL must be a full https:// URL.' };
    }
    return { mode: 'supabase', reason: null };
}
export const supabaseStatus = evaluate();
export const supabase = supabaseStatus.mode === 'supabase'
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
    : null;
export const isSupabaseMode = () => supabaseStatus.mode === 'supabase';
