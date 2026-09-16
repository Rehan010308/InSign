/**
 * Local demo store — the fallback used when Supabase is not configured.
 *
 * This is deliberately simple (localStorage, one JSON blob per table) and is
 * always disclosed in the UI as "LOCAL DEMO MODE". It is not a security
 * boundary and it is not the real persistence path: everything here stays in
 * this browser profile and is readable by anyone with the device.
 */
const PREFIX = 'insign.local.';
function read(table, fallback) {
    try {
        const raw = localStorage.getItem(PREFIX + table);
        return raw ? JSON.parse(raw) : fallback;
    }
    catch {
        return fallback;
    }
}
function write(table, value) {
    try {
        localStorage.setItem(PREFIX + table, JSON.stringify(value));
    }
    catch {
        /* quota or private mode — the demo simply does not persist */
    }
}
export const localStore = {
    all(table) {
        return read(table, []);
    },
    replace(table, rows) {
        write(table, rows);
    },
    insert(table, row) {
        const rows = read(table, []);
        rows.push(row);
        write(table, rows);
        return row;
    },
    update(table, id, patch) {
        const rows = read(table, []);
        const i = rows.findIndex(r => r.id === id);
        if (i === -1)
            return null;
        rows[i] = { ...rows[i], ...patch };
        write(table, rows);
        return rows[i];
    },
    getSingleton(table) {
        return read(table, null);
    },
    setSingleton(table, value) {
        write(table, value);
    },
    clearAll() {
        try {
            Object.keys(localStorage)
                .filter(k => k.startsWith(PREFIX))
                .forEach(k => localStorage.removeItem(k));
        }
        catch {
            /* ignore */
        }
    },
};
export function newId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        return crypto.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
export async function hashPassword(password) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        const bytes = new TextEncoder().encode('insign-demo:' + password);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Non-secure contexts (plain http on a LAN IP) have no SubtleCrypto. The demo
    // store is not a security boundary, so a marker is enough to keep it working.
    return 'plain:' + password;
}
