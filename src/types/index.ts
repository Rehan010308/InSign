export const SCENARIOS = [
  'interview',
  'presentation',
  'phone_call',
  'introduction',
  'conversation',
  'custom',
] as const;

export type Scenario = (typeof SCENARIOS)[number];

export const SCENARIO_LABELS: Record<Scenario, string> = {
  interview: 'Interview',
  presentation: 'Presentation',
  phone_call: 'Phone call',
  introduction: 'Introduction',
  conversation: 'Everyday conversation',
  custom: 'Custom',
};

export const SCENARIO_HINTS: Record<Scenario, string> = {
  interview: 'Real interview questions, one at a time.',
  presentation: 'Longer form, one idea at a time.',
  phone_call: 'A situation to talk your way through.',
  introduction: 'Say who you are in thirty seconds.',
  conversation: 'Relaxed, the way you actually talk.',
  custom: 'Describe your own situation.',
};

export interface Profile {
  id: string;
  display_name: string | null;
  created_at: string;
}

export interface UserPreferences {
  user_id: string;
  store_transcripts: boolean;
  filler_words: string[];
  sign_confidence_threshold: number;
  theme: string | null;
}

/**
 * The fillers counted unless the user edits the list in Settings. Multi-word
 * entries are matched as whole phrases, and every entry is matched on whole
 * tokens — "umbrella" is never an "um".
 */
export const DEFAULT_FILLER_WORDS = [
  'um', 'uh', 'hmm', 'like', 'basically', 'actually',
  'you know', 'sort of', 'kind of', 'i mean',
];

export const DEFAULT_PREFERENCES: Omit<UserPreferences, 'user_id'> = {
  store_transcripts: true,
  filler_words: DEFAULT_FILLER_WORDS,
  sign_confidence_threshold: 0.75,
  theme: null,
};

export interface SpeechSession {
  id: string;
  user_id: string;
  scenario: Scenario;
  transcript: string | null;
  duration_ms: number;
  words_per_minute: number;
  pause_count: number;
  repetition_count: number;
  filler_count: number;
  created_at: string;
}

export type NewSpeechSession = Omit<SpeechSession, 'id' | 'user_id' | 'created_at'> & {
  created_at?: string;
};

export interface SpeechPattern {
  id: string;
  user_id: string;
  pattern_key: string;
  scenario: Scenario | null;
  confidence: number;
  evidence: Record<string, unknown>;
  first_seen: string;
  last_seen: string;
  occurrence_count: number;
}

export interface PracticeRecommendation {
  id: string;
  user_id: string;
  source_pattern_id: string | null;
  recommendation: string;
  scenario: Scenario | null;
  status: 'open' | 'done' | 'dismissed';
  created_at: string;
}

export interface RecognizedSign {
  sign: string;
  confidence: number;
  at_ms: number;
  context_adjusted?: boolean;
}

export interface SignSession {
  id: string;
  user_id: string;
  recognized_signs: RecognizedSign[];
  duration_ms: number;
  created_at: string;
}

export type NewSignSession = Omit<SignSession, 'id' | 'user_id' | 'created_at'>;
