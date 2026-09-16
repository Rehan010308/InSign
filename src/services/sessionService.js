/**
 * The single data access surface for the app. Both backends implement the same
 * shape: Supabase (the real path, RLS-enforced) and the labeled local demo
 * store. Callers never branch on the mode — only the disclosure banner does.
 */
import { supabase } from './supabaseClient';
import { localStore, newId } from './localStore';
import { DEFAULT_PREFERENCES, } from '../types';
const T = {
    speech: 'speech_sessions',
    sign: 'sign_sessions',
    prefs: 'user_preferences',
    patterns: 'speech_patterns',
    recs: 'practice_recommendations',
    queue: 'pending_speech_sessions',
};
let offline = false;
const offlineListeners = new Set();
function setOffline(v) {
    if (offline === v)
        return;
    offline = v;
    offlineListeners.forEach(l => l(v));
}
export function onOfflineChange(cb) {
    offlineListeners.add(cb);
    cb(offline);
    return () => offlineListeners.delete(cb);
}
export const isOffline = () => offline;
function nowIso() {
    return new Date().toISOString();
}
/* ------------------------------------------------------------------ prefs */
export async function getPreferences(userId) {
    const fallback = { user_id: userId, ...DEFAULT_PREFERENCES };
    if (supabase) {
        const { data, error } = await supabase
            .from(T.prefs).select('*').eq('user_id', userId).maybeSingle();
        if (error) {
            setOffline(true);
            return localPrefs(userId, fallback);
        }
        setOffline(false);
        if (!data) {
            // The signup trigger normally creates this row; create it lazily if not.
            await supabase.from(T.prefs).insert({ user_id: userId, ...DEFAULT_PREFERENCES });
            return fallback;
        }
        return {
            user_id: userId,
            store_transcripts: data.store_transcripts ?? true,
            filler_words: data.filler_words ?? DEFAULT_PREFERENCES.filler_words,
            sign_confidence_threshold: Number(data.sign_confidence_threshold ?? 0.75),
            theme: data.theme ?? null,
        };
    }
    return localPrefs(userId, fallback);
}
function localPrefs(userId, fallback) {
    const all = localStore.all(T.prefs);
    return all.find(p => p.user_id === userId) ?? fallback;
}
export async function savePreferences(userId, patch) {
    const current = await getPreferences(userId);
    const next = { ...current, ...patch, user_id: userId };
    if (supabase) {
        const { error } = await supabase.from(T.prefs).upsert({ ...next }, { onConflict: 'user_id' });
        if (error)
            setOffline(true);
        else
            setOffline(false);
    }
    const all = localStore.all(T.prefs).filter(p => p.user_id !== userId);
    all.push(next);
    localStore.replace(T.prefs, all);
    return next;
}
export async function saveDisplayName(userId, displayName) {
    if (supabase) {
        await supabase.auth.updateUser({ data: { display_name: displayName } });
        await supabase.from('profiles').upsert({ id: userId, display_name: displayName }, { onConflict: 'id' });
        return;
    }
    const users = localStore.all('users');
    const i = users.findIndex(u => u.id === userId);
    if (i >= 0) {
        users[i].displayName = displayName;
        localStore.replace('users', users);
    }
}
/* --------------------------------------------------------- speech sessions */
export async function saveSpeechSession(userId, input) {
    const row = {
        id: newId(),
        user_id: userId,
        created_at: input.created_at ?? nowIso(),
        scenario: input.scenario,
        transcript: input.transcript,
        duration_ms: Math.round(input.duration_ms),
        words_per_minute: input.words_per_minute,
        pause_count: input.pause_count,
        repetition_count: input.repetition_count,
        filler_count: input.filler_count,
    };
    if (supabase) {
        const { data, error } = await supabase.from(T.speech).insert({
            user_id: userId,
            scenario: row.scenario,
            transcript: row.transcript,
            duration_ms: row.duration_ms,
            words_per_minute: row.words_per_minute,
            pause_count: row.pause_count,
            repetition_count: row.repetition_count,
            filler_count: row.filler_count,
            created_at: row.created_at,
        }).select().single();
        if (error) {
            setOffline(true);
            localStore.insert(T.queue, { ...row, queued: true });
            return row;
        }
        setOffline(false);
        return data;
    }
    localStore.insert(T.speech, row);
    return row;
}
export async function listSpeechSessions(userId, limit = 100) {
    if (supabase) {
        const { data, error } = await supabase
            .from(T.speech).select('*').eq('user_id', userId)
            .order('created_at', { ascending: false }).limit(limit);
        if (error) {
            setOffline(true);
            return localSpeech(userId, limit);
        }
        setOffline(false);
        const queued = localStore.all(T.queue).filter(q => q.user_id === userId);
        return [...data, ...queued]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, limit);
    }
    return localSpeech(userId, limit);
}
function localSpeech(userId, limit) {
    return localStore.all(T.speech)
        .filter(s => s.user_id === userId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
}
export async function getSpeechSession(userId, id) {
    const all = await listSpeechSessions(userId, 500);
    return all.find(s => s.id === id) ?? null;
}
/** Retries any sessions that were saved while Supabase was unreachable. */
export async function flushPendingSessions(userId) {
    if (!supabase)
        return 0;
    const queued = localStore.all(T.queue).filter(q => q.user_id === userId);
    if (!queued.length)
        return 0;
    let sent = 0;
    const remaining = [];
    for (const q of queued) {
        const { error } = await supabase.from(T.speech).insert({
            user_id: q.user_id, scenario: q.scenario, transcript: q.transcript,
            duration_ms: q.duration_ms, words_per_minute: q.words_per_minute,
            pause_count: q.pause_count, repetition_count: q.repetition_count,
            filler_count: q.filler_count, created_at: q.created_at,
        });
        if (error)
            remaining.push(q);
        else
            sent++;
    }
    localStore.replace(T.queue, remaining);
    if (!remaining.length)
        setOffline(false);
    return sent;
}
export const pendingSessionCount = (userId) => localStore.all(T.queue).filter(q => q.user_id === userId).length;
/* ----------------------------------------------------------- sign sessions */
export async function saveSignSession(userId, input) {
    const row = {
        id: newId(),
        user_id: userId,
        created_at: nowIso(),
        recognized_signs: input.recognized_signs,
        duration_ms: Math.round(input.duration_ms),
    };
    if (supabase) {
        const { data, error } = await supabase.from(T.sign).insert({
            user_id: userId,
            recognized_signs: row.recognized_signs,
            duration_ms: row.duration_ms,
            created_at: row.created_at,
        }).select().single();
        if (!error) {
            setOffline(false);
            return data;
        }
        setOffline(true);
    }
    localStore.insert(T.sign, row);
    return row;
}
export async function listSignSessions(userId, limit = 50) {
    if (supabase) {
        const { data, error } = await supabase
            .from(T.sign).select('*').eq('user_id', userId)
            .order('created_at', { ascending: false }).limit(limit);
        if (!error) {
            setOffline(false);
            return data;
        }
        setOffline(true);
    }
    return localStore.all(T.sign)
        .filter(s => s.user_id === userId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
}
export async function upsertPattern(userId, p) {
    const existing = (await listPatterns(userId)).find(x => x.pattern_key === p.pattern_key && x.scenario === p.scenario);
    const ts = nowIso();
    const row = existing
        ? { ...existing, confidence: p.confidence, evidence: p.evidence, last_seen: ts, occurrence_count: existing.occurrence_count + 1 }
        : {
            id: newId(), user_id: userId, pattern_key: p.pattern_key, scenario: p.scenario,
            confidence: p.confidence, evidence: p.evidence, first_seen: ts, last_seen: ts, occurrence_count: 1,
        };
    if (supabase) {
        if (existing) {
            const { error } = await supabase.from(T.patterns).update({
                confidence: row.confidence, evidence: row.evidence,
                last_seen: row.last_seen, occurrence_count: row.occurrence_count,
            }).eq('id', existing.id);
            if (!error)
                return row;
        }
        else {
            const { data, error } = await supabase.from(T.patterns).insert({
                user_id: userId, pattern_key: row.pattern_key, scenario: row.scenario,
                confidence: row.confidence, evidence: row.evidence,
                first_seen: row.first_seen, last_seen: row.last_seen, occurrence_count: 1,
            }).select().single();
            if (!error)
                return data;
        }
        setOffline(true);
    }
    const all = localStore.all(T.patterns).filter(x => x.id !== row.id);
    all.push(row);
    localStore.replace(T.patterns, all);
    return row;
}
export async function listPatterns(userId) {
    if (supabase) {
        const { data, error } = await supabase.from(T.patterns).select('*').eq('user_id', userId);
        if (!error)
            return data;
        setOffline(true);
    }
    return localStore.all(T.patterns).filter(p => p.user_id === userId);
}
export async function setOpenRecommendation(userId, rec) {
    const row = {
        id: newId(), user_id: userId, source_pattern_id: rec.source_pattern_id,
        recommendation: rec.recommendation, scenario: rec.scenario,
        status: 'open', created_at: nowIso(),
    };
    if (supabase) {
        await supabase.from(T.recs).update({ status: 'done' }).eq('user_id', userId).eq('status', 'open');
        const { data, error } = await supabase.from(T.recs).insert({
            user_id: userId, source_pattern_id: row.source_pattern_id,
            recommendation: row.recommendation, scenario: row.scenario, status: 'open',
        }).select().single();
        if (!error)
            return data;
        setOffline(true);
    }
    const all = localStore.all(T.recs)
        .map(r => (r.user_id === userId && r.status === 'open' ? { ...r, status: 'done' } : r));
    all.push(row);
    localStore.replace(T.recs, all);
    return row;
}
export async function getOpenRecommendation(userId) {
    if (supabase) {
        const { data, error } = await supabase.from(T.recs).select('*')
            .eq('user_id', userId).eq('status', 'open')
            .order('created_at', { ascending: false }).limit(1);
        if (!error)
            return data?.[0] ?? null;
        setOffline(true);
    }
    const open = localStore.all(T.recs)
        .filter(r => r.user_id === userId && r.status === 'open')
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return open[0] ?? null;
}
