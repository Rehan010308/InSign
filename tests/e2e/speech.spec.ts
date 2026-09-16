import { expect, test } from '@playwright/test';
import {
  expectNoHorizontalOverflow, openAppMenu, seedSpeechSessions, signUp, trackConsoleErrors, uniqueEmail,
} from './helpers';

test.describe('auth', () => {
  test('protected routes redirect to sign-in and preserve the destination', async ({ page }) => {
    await page.goto('/app/speech');
    await expect(page).toHaveURL(/\/auth\/signin\?next=%2Fapp%2Fspeech/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome');
  });

  test('sign-up lands on the dashboard, sign-out returns to the landing page', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const { email, password } = await signUp(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back');

    await openAppMenu(page);
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL('http://localhost:5173/');

    await page.goto('/auth/signin');
    await page.getByLabel('EMAIL').fill(email);
    await page.getByLabel('PASSWORD').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/dashboard');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('form errors are inline, specific and calm', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.getByLabel('EMAIL').fill('not-an-email');
    await page.getByLabel('PASSWORD').fill('123');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByRole('alert')).toContainText('email address looks incomplete');

    await page.getByLabel('EMAIL').fill(uniqueEmail());
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByRole('alert')).toContainText('at least 6 characters');
  });

  test('signing in with an unknown account explains what happened', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.getByLabel('EMAIL').fill(uniqueEmail('nobody'));
    await page.getByLabel('PASSWORD').fill('practice123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('alert')).toContainText('No account here with that email');
  });

  test('the persistence mode is always disclosed', async ({ page }) => {
    await signUp(page);
    await expect(page.getByText('LOCAL DEMO MODE')).toBeVisible();
  });
});

test.describe('speech practice', () => {
  test('a typed transcript produces exactly the expected metrics', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await signUp(page);
    await page.goto('/app/speech');

    await page.getByRole('button', { name: 'Interview' }).click();
    await page.getByRole('button', { name: /type my transcript/i }).click();
    await page.getByTestId('begin-session').click();

    // 11 words · 2 typed pause marks · "I I" repeated · um + basically + you know
    await page.getByTestId('manual-transcript')
      .fill('um I I think... we should basically you know go -- now');
    await page.getByTestId('manual-seconds').fill('60');

    await expect(page.getByTestId('metric-wpm')).toHaveText('11');
    await expect(page.getByTestId('metric-pauses')).toHaveText('2');
    await expect(page.getByTestId('metric-repetitions')).toHaveText('1');
    await expect(page.getByTestId('metric-fillers')).toHaveText('3');

    await page.getByTestId('stop-session').click();
    await expect(page.getByTestId('review-transcript')).toContainText('we should basically');

    await page.getByTestId('save-session').click();
    await page.waitForURL('**/app/speech/history**');
    await expect(page.getByTestId('session-list').locator('.session-row')).toHaveCount(1);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('saving an empty transcript is refused inline', async ({ page }) => {
    await signUp(page);
    await page.goto('/app/speech');
    await page.getByRole('button', { name: 'Conversation' }).click();
    await page.getByRole('button', { name: /type my transcript/i }).click();
    await page.getByTestId('begin-session').click();
    await page.getByTestId('stop-session').click();
    await page.getByTestId('save-session').click();
    await expect(page.getByRole('alert')).toContainText('nothing to save yet');
  });

  test('how speech is processed is disclosed honestly', async ({ page }) => {
    await signUp(page);
    await page.goto('/app/speech');
    await page.getByRole('button', { name: /how speech is processed/i }).click();
    const notice = page.locator('.notice').filter({ hasText: 'browser vendor' });
    await expect(notice).toContainText("may send your audio to your browser vendor's service");
    await expect(notice).toContainText('runs locally');
  });

  test('fewer than three same-scenario sessions refuses to claim a pattern', async ({ page }) => {
    await signUp(page);
    await page.goto('/app/speech/history');
    await seedSpeechSessions(page, [
      { scenario: 'interview', duration_ms: 120000, words_per_minute: 120, pause_count: 12, repetition_count: 1, filler_count: 2, daysAgo: 1 },
      { scenario: 'interview', duration_ms: 120000, words_per_minute: 118, pause_count: 13, repetition_count: 1, filler_count: 2, daysAgo: 2 },
    ]);
    await page.reload();
    await expect(page.getByTestId('recommendation')).toContainText('Complete a few more sessions');
  });

  test('three same-scenario sessions produce a data-derived recommendation', async ({ page }) => {
    await signUp(page);
    await page.goto('/app/speech/history');
    await seedSpeechSessions(page, [
      { scenario: 'interview', duration_ms: 120000, words_per_minute: 120, pause_count: 14, repetition_count: 1, filler_count: 2, daysAgo: 1 },
      { scenario: 'interview', duration_ms: 120000, words_per_minute: 119, pause_count: 13, repetition_count: 1, filler_count: 2, daysAgo: 3 },
      { scenario: 'interview', duration_ms: 120000, words_per_minute: 121, pause_count: 15, repetition_count: 1, filler_count: 2, daysAgo: 6 },
      { scenario: 'conversation', duration_ms: 120000, words_per_minute: 130, pause_count: 3, repetition_count: 1, filler_count: 2, daysAgo: 2 },
      { scenario: 'conversation', duration_ms: 120000, words_per_minute: 128, pause_count: 4, repetition_count: 1, filler_count: 2, daysAgo: 4 },
    ]);
    await page.reload();

    // Matches the personalizationEngine unit fixture exactly: 14 average pauses.
    await expect(page.getByTestId('recommendation')).toContainText('14 pauses');
    await expect(page.getByTestId('recommendation')).toContainText('interview');
    await expect(page.getByTestId('rationale')).toContainText('last 3 interview sessions');

    await page.goto('/dashboard');
    await expect(page.locator('.next-practice')).toContainText('14 pauses');
  });

  test('turning off store_transcripts redacts the transcript in history', async ({ page }) => {
    await signUp(page);
    await page.goto('/settings');
    await page.getByTestId('store-transcripts').uncheck();
    await expect(page.getByTestId('saved-notice')).toBeVisible();

    await page.goto('/app/speech');
    await page.getByRole('button', { name: 'Introduction' }).click();
    await page.getByRole('button', { name: /type my transcript/i }).click();
    await page.getByTestId('begin-session').click();
    await page.getByTestId('manual-transcript').fill('this text must never reach storage');
    await page.getByTestId('stop-session').click();
    await expect(page.getByText('STORE TRANSCRIPTS IS OFF')).toBeVisible();
    await page.getByTestId('save-session').click();
    await page.waitForURL('**/app/speech/history**');

    await expect(page.getByText('TRANSCRIPT NOT STORED')).toBeVisible();
    const stored = await page.evaluate(() =>
      localStorage.getItem('insign.local.speech_sessions') ?? '');
    expect(stored).not.toContain('must never reach storage');

    await page.locator('.session-row').first().click();
    await expect(page.getByTestId('detail-transcript-redacted')).toBeVisible();
  });

  test('a custom filler list changes what is counted', async ({ page }) => {
    await signUp(page);
    await page.goto('/settings');
    await page.getByTestId('filler-words').fill('sort of, honestly');
    await page.getByTestId('filler-words').blur();
    await expect(page.getByTestId('saved-notice')).toBeVisible();

    await page.goto('/app/speech');
    await page.getByRole('button', { name: 'Custom' }).click();
    await page.getByRole('button', { name: /type my transcript/i }).click();
    await page.getByTestId('begin-session').click();
    await page.getByTestId('manual-transcript').fill('um honestly it was sort of fine honestly');
    // "um" is no longer in the list; "honestly" ×2 and "sort of" ×1 are.
    await expect(page.getByTestId('metric-fillers')).toHaveText('3');
  });

  test('the app shell has no horizontal overflow', async ({ page }) => {
    await signUp(page);
    for (const path of ['/dashboard', '/app/speech', '/app/speech/history', '/settings']) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page);
    }
  });
});
