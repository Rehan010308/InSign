export const SCENARIOS = [
    'interview',
    'presentation',
    'phone_call',
    'introduction',
    'conversation',
    'custom',
];
export const SCENARIO_LABELS = {
    interview: 'Interview',
    presentation: 'Presentation',
    phone_call: 'Phone call',
    introduction: 'Introduction',
    conversation: 'Conversation',
    custom: 'Custom',
};
export const SCENARIO_HINTS = {
    interview: 'Answer questions under mild pressure.',
    presentation: 'Longer form, one idea at a time.',
    phone_call: 'No faces, only voice.',
    introduction: 'Say who you are in thirty seconds.',
    conversation: 'Relaxed, back and forth.',
    custom: 'Anything you want to practise.',
};
export const DEFAULT_FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'actually', 'basically'];
export const DEFAULT_PREFERENCES = {
    store_transcripts: true,
    filler_words: DEFAULT_FILLER_WORDS,
    sign_confidence_threshold: 0.75,
    theme: null,
};
