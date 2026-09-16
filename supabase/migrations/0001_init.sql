-- ============================================================
-- InSign — initial schema.
-- Every table is owned by a user and readable only by that user.
-- RLS is enabled before any policy or data touches the table.
-- ============================================================

-- ---------- profiles ----------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are self-readable"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles are self-insertable"
  on public.profiles for insert with check (auth.uid() = id);
create policy "profiles are self-updatable"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles are self-deletable"
  on public.profiles for delete using (auth.uid() = id);

-- ---------- user_preferences -------------------------------------------
create table if not exists public.user_preferences (
  user_id                  uuid primary key references auth.users (id) on delete cascade,
  store_transcripts        boolean not null default true,
  filler_words             text[]  not null default array['um','uh','like','you know','actually','basically'],
  sign_confidence_threshold numeric not null default 0.75
    check (sign_confidence_threshold >= 0 and sign_confidence_threshold <= 1),
  theme                    text
);

alter table public.user_preferences enable row level security;

create policy "prefs are self-readable"
  on public.user_preferences for select using (auth.uid() = user_id);
create policy "prefs are self-insertable"
  on public.user_preferences for insert with check (auth.uid() = user_id);
create policy "prefs are self-updatable"
  on public.user_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "prefs are self-deletable"
  on public.user_preferences for delete using (auth.uid() = user_id);

-- ---------- speech_sessions --------------------------------------------
create table if not exists public.speech_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  scenario         text not null check (scenario in
                     ('interview','presentation','phone_call','introduction','conversation','custom')),
  transcript       text,
  duration_ms      integer not null default 0 check (duration_ms >= 0),
  words_per_minute numeric not null default 0 check (words_per_minute >= 0),
  pause_count      integer not null default 0 check (pause_count >= 0),
  repetition_count integer not null default 0 check (repetition_count >= 0),
  filler_count     integer not null default 0 check (filler_count >= 0),
  created_at       timestamptz not null default now()
);

-- The history and personalization queries are always "this user, newest first".
create index if not exists speech_sessions_user_created_idx
  on public.speech_sessions (user_id, created_at desc);

alter table public.speech_sessions enable row level security;

create policy "speech sessions are self-readable"
  on public.speech_sessions for select using (auth.uid() = user_id);
create policy "speech sessions are self-insertable"
  on public.speech_sessions for insert with check (auth.uid() = user_id);
create policy "speech sessions are self-updatable"
  on public.speech_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "speech sessions are self-deletable"
  on public.speech_sessions for delete using (auth.uid() = user_id);

-- ---------- speech_patterns --------------------------------------------
create table if not exists public.speech_patterns (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  pattern_key      text not null,
  scenario         text,
  confidence       numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  evidence         jsonb not null default '{}'::jsonb,
  first_seen       timestamptz not null default now(),
  last_seen        timestamptz not null default now(),
  occurrence_count integer not null default 1 check (occurrence_count >= 1)
);

-- One row per (user, pattern, scenario) so recurrence updates instead of piling up.
create unique index if not exists speech_patterns_unique_idx
  on public.speech_patterns (user_id, pattern_key, coalesce(scenario, ''));

alter table public.speech_patterns enable row level security;

create policy "patterns are self-readable"
  on public.speech_patterns for select using (auth.uid() = user_id);
create policy "patterns are self-insertable"
  on public.speech_patterns for insert with check (auth.uid() = user_id);
create policy "patterns are self-updatable"
  on public.speech_patterns for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "patterns are self-deletable"
  on public.speech_patterns for delete using (auth.uid() = user_id);

-- ---------- practice_recommendations ------------------------------------
create table if not exists public.practice_recommendations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  source_pattern_id uuid references public.speech_patterns (id) on delete set null,
  recommendation    text not null,
  scenario          text,
  status            text not null default 'open' check (status in ('open','done','dismissed')),
  created_at        timestamptz not null default now()
);

create index if not exists recommendations_open_idx
  on public.practice_recommendations (user_id, status, created_at desc);

alter table public.practice_recommendations enable row level security;

create policy "recommendations are self-readable"
  on public.practice_recommendations for select using (auth.uid() = user_id);
create policy "recommendations are self-insertable"
  on public.practice_recommendations for insert with check (auth.uid() = user_id);
create policy "recommendations are self-updatable"
  on public.practice_recommendations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recommendations are self-deletable"
  on public.practice_recommendations for delete using (auth.uid() = user_id);

-- ---------- sign_sessions ------------------------------------------------
-- recognized_signs: [{ "sign": "HELLO", "confidence": 0.82, "at_ms": 1400 }]
-- No video or landmark data is ever stored or uploaded.
create table if not exists public.sign_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  recognized_signs jsonb not null default '[]'::jsonb,
  duration_ms      integer not null default 0 check (duration_ms >= 0),
  created_at       timestamptz not null default now()
);

create index if not exists sign_sessions_user_created_idx
  on public.sign_sessions (user_id, created_at desc);

alter table public.sign_sessions enable row level security;

create policy "sign sessions are self-readable"
  on public.sign_sessions for select using (auth.uid() = user_id);
create policy "sign sessions are self-insertable"
  on public.sign_sessions for insert with check (auth.uid() = user_id);
create policy "sign sessions are self-updatable"
  on public.sign_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sign sessions are self-deletable"
  on public.sign_sessions for delete using (auth.uid() = user_id);

-- ---------- signup trigger ----------------------------------------------
-- Creates the profile and preference rows so the app never has to guess
-- whether they exist. SECURITY DEFINER because it runs before the new user
-- has a session of their own; search_path is pinned to stop hijacking.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
