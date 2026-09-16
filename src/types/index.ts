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
  conversation: 'Conversation',
  custom: 'Custom',
};

export const SCENARIO_HINTS: Record<Scenario, string> = {
  interview: 'Answer questions under mild pressure.',
  presentation: 'Longer form, one idea at a time.',
  phone_call: 'No faces, only voice.',
  introduction: 'Say who you are in thirty seconds.',
  conversation: 'Relaxed, back and forth.',
  custom: 'Anything you want to practise.',
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

export const DEFAULT_FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'actually', 'basically'];

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
