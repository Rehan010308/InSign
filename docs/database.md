# Database

One migration, `supabase/migrations/0001_init.sql`. Run it before the app talks
to Supabase — the client assumes the schema and the policies are already there.

## Schema

| Table | Holds | Notes |
| --- | --- | --- |
| `profiles` | display name | keyed on `auth.users.id` |
| `user_preferences` | store_transcripts, filler_words, sign_confidence_threshold, theme | one row per user; the filler list is the user's own, and the metrics honour it |
| `speech_sessions` | scenario, transcript, duration, wpm, pauses, repetitions, fillers | the transcript column is `null` when the user has store_transcripts off |
| `speech_patterns` | pattern_key, scenario, confidence, evidence (jsonb), occurrence_count | one row per (user, pattern, scenario); recurrence updates rather than appends |
| `practice_recommendations` | recommendation text, scenario, status | the newest `open` row is the dashboard's "NEXT PRACTICE" |
| `sign_sessions` | recognized_signs (jsonb), duration | `[{ sign, confidence, at_ms }]` — **no video and no landmarks, ever** |

Constraints that matter: `scenario` is checked against the six the UI offers,
`sign_confidence_threshold` is checked into `[0, 1]`, and the counts are checked
non-negative. These are cheap and they stop a bad client write from producing a
metric that cannot exist.

Two indexes carry the real queries — `(user_id, created_at desc)` on both session
tables, because every list the app draws is "this user, newest first".

## Row-level security

RLS is enabled on **every** table in the same statement block that creates it,
before any policy or data exists, and each table gets four policies — SELECT,
INSERT, UPDATE, DELETE — all of the form `auth.uid() = user_id` (`= id` for
`profiles`).

Why four rather than one `FOR ALL`: an `INSERT` needs `WITH CHECK` and a `SELECT`
needs `USING`, and writing them separately makes it obvious at a glance that a
user can neither read another user's rows nor write a row that claims to be
someone else's. `speech_sessions` is the table that would leak transcripts if
this were wrong, so it is worth the extra lines.

Because RLS scopes every query, the client's `.eq('user_id', userId)` filters are
for clarity and index selection, not for safety.

## The signup trigger

`handle_new_user()` runs `after insert on auth.users` and creates the `profiles`
and `user_preferences` rows, so the app never has to guess whether they exist.
It is `security definer` because it runs before the new user has a session of
their own, and `search_path` is pinned to `public, pg_temp` — a `security
definer` function without a pinned search path is a privilege-escalation
opening, since a caller could otherwise point it at their own schema.

Both inserts are `on conflict do nothing`, so re-running the migration or
re-creating a user is harmless. `sessionService.getPreferences` also creates the
preferences row lazily if it is somehow missing, which keeps a project that was
set up out of order from breaking.

## Keys

The browser gets the **anon key** only. The service-role key bypasses RLS
entirely; in a Vite bundle it would be readable by anyone who opens the site.
`supabaseClient.ts` decodes the key's JWT payload at startup and refuses to
build a client if the role is `service_role`, and `npm run check:secrets` scans
`src/` and `dist/` for one before you ship.

## The local demo store

When the env vars are absent, `sessionService` writes to localStorage under
`insign.local.*` instead. It mirrors the same table names and the same function
signatures, so nothing above it knows the difference — but it is not a security
boundary, it is per-browser, and `ModeBanner` says so on every app screen. The
Supabase path is the real one; the fallback exists so the app is never a dead
screen before setup.
