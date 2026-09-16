# InSign — High-Level Data Model & Mock Data
CONCEPTUAL ONLY. No Supabase code, no SQL, no backend. This exists so the frontend has a clear shape and Claude can later wire real persistence into exact seams. Frontend consumes everything through typed interfaces in `lib/integrations/` with mock implementations in `lib/mock/`.

---

## 1. Entity map

```
Profile ──┬── UserPreferences
          ├── SpeechSession ──┬── SpeechFeedback
          │                   └── SpeechScenario (many-to-one)
          ├── SignSession ──── SignResult (one session : many results)
          └── (adaptive plan is DERIVED from speech history, not stored)
```

---

## 2. Entities (conceptual fields — names indicative, exact SQL later)

### Profile
The user. `id · display_name · email · avatar_url · created_at · auth_fields (managed by auth provider, not designed here)`. Note for Claude-later: profile should carry no medical data — only practice data.

### UserPreferences
One-to-one with Profile. `theme_motion ("system" | "reduced") · text_scale ("default" | "large" | "xl") · preferred_mic_device · preferred_camera_device · tts_enabled · data_stays_local (boolean, demo privacy note) · onboarding_completed`.

### SpeechScenario
A practice situation type. `id · slug ("interview" | "presentation" | "phone-call" | "introduction" | "conversation" | "custom") · display_name · icon · description · default_duration_seconds · is_custom (custom ones belong to a Profile) · sort_order`.

### SpeechSession
One practice run. `id · profile_id · scenario_id · started_at · duration_seconds · status ("completed" | "abandoned") · transcript_preview (short string, optional)`. This is the activity-history unit (feeds streaks, heatmap, recent list).

### SpeechFeedback
One-to-one with SpeechSession. THE integration seam for the AI later. Conceptually holds:
`pace_wpm (number) · pace_band ("slow" | "steady" | "fast") · pauses (array of { at_seconds, duration_ms }) · difficult_moments (array of { at_seconds, quote, observation }) · session_notes (string, neutral phrasing) · overall_score_0_to_100 (optional)`.
Constraints on presentation (binding for frontend AND later backend): no medical claims, no "fluency score" framing, observations phrased neutrally, scores always shown with `DEMO DATA` label until real.

### SpeechProgressPoint (derived/aggregated — may be computed, not stored)
What the dashboard/progress/chapter-05 need per scenario: `scenario_id · relative_difficulty ("low" | "medium" | "high") · trend ("improving" | "steady" | "needs-attention") · last_practiced_at · sessions_count · recommended (boolean) · recommendation_reason (string)`.
**The adaptive plan = this list with exactly one `recommended: true`.** Later, the AI replaces the mock generator behind the same interface — UI never changes.

### SignSession
One translator usage period. `id · profile_id · started_at · ended_at · device_info (optional) · continuous_mode (boolean)`.

### SignResult
One recognition event. `id · sign_session_id · recognized_text · confidence_0_to_1 · at_offset_ms · raw_trajectory_summary (optional, later: compact landmark data) · smoothing_applied (boolean)`.
Presentation constraint: confidence shown as a meter + `DEMO DATA` badge; never as a headline "accuracy" number.

### App Settings equivalents live in UserPreferences. No other entities in v1 — resist scope creep during a 24h hackathon.

---

## 3. Mock data requirement (frontend must look complete day one)

All mock data lives in `lib/mock/` — one module per domain (`profile.ts`, `scenarios.ts`, `speechSessions.ts`, `speechFeedback.ts`, `adaptivePlan.ts`, `signResults.ts`) exporting typed constants shaped exactly like the integration interfaces. Every panel that renders it shows the `DEMO DATA` micro badge. No invented precision ("98.7% accuracy" banned even as a joke); plausible round values instead.

Required mock datasets:

1. **Scenarios (5 + custom):** the four standard + Introduction + one custom ("Team standup"). Each with icon, description, mock difficulty.
2. **Speech history (~14 sessions / 3 weeks):** varied durations (2–7 min), realistic timestamps (weekdays heavier), a believable pattern: Interview sessions harder + more frequent recently, Conversation steady-low. This pattern is what the adaptive plan "explains" — the mock story must be internally consistent.
3. **Feedback reports (3 distinct full reports):** one per difficulty band, e.g. pace 92 wpm "steady"; pauses at [12s, 48s, 96s]; difficult moments with short realistic quotes ("Tell me about a project you led…" — observation: "Longest pause came before your second key point."); session notes neutral and forward-looking. Must read as kind, specific, non-medical.
4. **Adaptive plan:** Interview HIGH (trend: needs-attention, recommended, reason: "Hardest scenario in your last three sessions — next session starts with shorter prompts."), Presentation MEDIUM (steady), Conversation LOW (improving), others unrated ("Practice once to see your pattern.").
5. **Sign recognition:** sequence of 5 demo results with plausible signs and confidence 0.71–0.96: e.g. "HELLO" 0.94, "THANK YOU" 0.91, "YES" 0.88, "HELP" 0.83, "PLEASE" 0.76 — fed to the demo visual + translator history.
6. **Recognition states:** the tracking state machine mock cycle: SEARCHING (2s) → TRACKING (3s) → HOLD STEADY (1s) → RECOGNIZED (result) → idle. Also mock landmark coordinates for the camera overlay (pre-baked 21-point hand sets + jittery/smooth trajectory point arrays for chapter 07 and `/translator/demo`).
7. **Progress:** weekly goal (4 sessions, 3 done → ring 75%), streak 5 days, 12-week heatmap sparse but patterned.

Consistency rule: every screen showing "session count" etc. reads from the same mock modules — numbers must agree across dashboard, progress, and landing chapter 05.

---

## 4. Integration seams (typed stubs — empty implementations, clear contracts)

Create `lib/integrations/` with one file per future concern. Each exports a TypeScript interface + a stub object that returns mock data with `// TODO(integration):` comments describing what replaces it. The UI imports ONLY these interfaces — swapping mock→real touches no component code.

| File | Interface (sketch) | Replaced later by |
|---|---|---|
| `speechAnalysis.ts` | `analyzeSession(recording: Recording): Promise<SpeechFeedback>` | AI speech processing |
| `signRecognition.ts` | `initCamera(): Promise<CameraHandle>` · `onLandmarks(cb)` · `onRecognition(cb)` | Computer vision pipeline |
| `speechCapture.ts` | `requestMic(): Promise<MicHandle>` · `getLevel()` | Web Audio/ASR |
| `database.ts` | `getProfile()` · `listSessions()` · `saveSession()` · `getAdaptivePlan()` · `savePreferences()` | Supabase client |
| `auth.ts` | `signIn()` · `signUp()` · `resetPassword()` · `onAuthChange()` | Supabase Auth |
| `tts.ts` | `speak(text: string)` | Speech synthesis |

Each stub also documents expected latency behavior (so UI states stay correct when real async arrives) and failure modes the UI already handles (permission denied, empty data, network error).
