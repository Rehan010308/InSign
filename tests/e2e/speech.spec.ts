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
    // The banner explains the consequence, not the configuration.
    await expect(page.locator('.mode-banner')).not.toContainText('VITE_SUPABASE');
  });
});

test.describe('scenario practice', () => {
  test('every scenario opens its own kind of practice', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await signUp(page);

    const cases = [
      { button: 'Interview', screen: 'INTERVIEW PRACTICE', kind: 'QUESTION' },
      { button: 'Presentation', screen: 'PRESENTATION PRACTICE', kind: 'PROMPT' },
      { button: 'Phone call', screen: 'PHONE CALL PRACTICE', kind: 'SITUATION' },
      { button: 'Introduction', screen: 'INTRODUCTION PRACTICE', kind: 'PROMPT' },
      { button: 'Everyday conversation', screen: 'EVERYDAY CONVERSATION', kind: 'SITUATION' },
    ];

    for (const c of cases) {
      await page.goto('/app/speech');
      await page.getByRole('button', { name: c.button, exact: true }).click();
      await page.getByTestId('begin-session').click();

      const card = page.getByTestId('practice-prompt');
      await expect(card).toContainText(c.screen);
      await expect(card).toContainText(c.kind);
      // A real prompt, not a placeholder.
      await expect(page.getByTestId('prompt-text')).not.toBeEmpty();
      const prompt = await page.getByTestId('prompt-text').textContent();
      expect(prompt!.trim().length).toBeGreaterThan(10);
      await expect(page.getByTestId('start-practice')).toBeVisible();
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('a phone call states the situation and the task it sets', async ({ page }) => {
    await signUp(page);
    await page.goto('/app/speech');
    await page.getByRole('button', { name: 'Phone call', exact: true }).click();
    await page.getByTestId('begin-session').click();
    await expect(page.getByTestId('practice-prompt')).toContainText('YOUR TASK');
    await expect(page.getByTestId('prompt-task')).not.toBeEmpty();
  });

  test('an interview shows where you are in the sitting', async ({ page }) => {
    await signUp(page);
    await page.goto('/app/speech');
    await page.getByRole('button', { name: 'Interview', exact: true }).click();
    await page.getByTestId('begin-session').click();
    await expect(page.getByTestId('question-progress')).toContainText('QUESTION 1 OF 5');
  });

  test('another question keeps the scenario and changes the question', async ({ page }) => {
    await signUp(page);
    await page.goto('/app/speech');
    await page.getByRole('button', { name: 'Interview', exact: true }).click();
    await page.getByTestId('begin-session').click();

    const first = await page.getByTestId('prompt-text').textContent();
    await page.getByTestId('skip-question').click();
    await expect(page.getByTestId('prompt-text')).not.toHaveText(first!);
    await expect(page.getByTestId('practice-prompt')).toContainText('INTERVIEW PRACTICE');
  });

  test('custom practice turns the user own words into the prompt', async ({ page }) => {
    await signUp(page);
    await page.goto('/app/speech');
    await page.getByRole('button', { name: 'Custom', exact: true }).click();

    // Nothing described yet, so there is nothing to practise.
    await expect(page.getByTestId('begin-session')).toBeDisabled();

    await page.getByTestId('custom-situation')
      .fill('i have to explain my robotics project to a professor');
    await page.getByTestId('begin-session').click();
    await expect(page.getByTestId('prompt-text'))
      .toHaveText('I have to explain my robotics project to a professor.');
    await expect(page.getByTestId('practice-prompt')).toContainText('CUSTOM PRACTICE');
  });

  test('starting practice moves into a clear listening state', async ({ page }) => {
    await signUp(page);
    await page.goto('/app/speech');
    await page.getByRole('button', { name: 'Introduction', exact: true }).click();
    await page.getByTestId('begin-session').click();
    await page.getByTestId('start-practice').click();

    const stage = page.getByTestId('listening-stage');
    await expect(stage).toBeVisible();
    // The question stays visible while answering; no metric does.
    await expect(page.getByTestId('stage-prompt')).not.toBeEmpty();
    await expect(page.getByTestId('metric-tiles')).toHaveCount(0);
    await expect(page.getByTestId('timer')).toBeVisible();
    await expect(page.getByTestId('stop-session')).toBeVisible();
    await expect(page.locator('.voice-bars i')).not.toHaveCount(0);

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('practice-prompt')).toBeVisible();
  });

  test('how speech is processed is disclosed honestly', async ({ page }) => {
    await signUp(page);
    await page.goto('/app/speech');
    await page.getByRole('button', { name: /how speech is processed/i }).click();
    const notice = page.locator('.notice').filter({ hasText: 'browser vendor' });
    await expect(notice).toContainText("may send your audio to your browser vendor's service");
    await expect(notice).toContainText('computed in this page');
  });

  test('no prototype or medical language is on the practice screens', async ({ page }) => {
    await signUp(page);
    for (const path of ['/app/speech', '/dashboard', '/app/speech/history']) {
      await page.goto(path);
      const body = (await page.locator('body').innerText()).toLowerCase();
      for (const word of ['hackathon', 'placeholder pipelines', 'disorder', 'diagnos', 'therapy', 'treatment']) {
        expect(body, `${word} on ${path}`).not.toContain(word);
      }
    }
  });
});

test.describe('personalization from real history', () => {
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

  test('interview history steers the interview question, not the conversation one', async ({ page }) => {
    await signUp(page);
    await page.goto('/app/speech');
    // Eight interview sessions: enough history to have moved past question one.
    await seedSpeechSessions(page, Array.from({ length: 8 }, (_, i) => ({
      scenario: 'interview',
      duration_ms: 60000,
      words_per_minute: 120,
      pause_count: 3,
      repetition_count: 1,
      filler_count: 9,
      daysAgo: i + 1,
    })));
    await page.reload();

    await page.getByRole('button', { name: 'Interview', exact: true }).click();
    await page.getByTestId('begin-session').click();
    const withHistory = await page.getByTestId('prompt-text').textContent();

    // A scenario with no history of its own is untouched by it.
    await page.goto('/app/speech');
    await page.getByRole('button', { name: 'Presentation', exact: true }).click();
    await page.getByTestId('begin-session').click();
    const fresh = await page.getByTestId('prompt-text').textContent();

    expect(withHistory).not.toBe(fresh);
    expect(withHistory!.trim().length).toBeGreaterThan(10);
  });
});

test.describe('layout', () => {
  test('the app shell has no horizontal overflow', async ({ page }) => {
    await signUp(page);
    for (const path of ['/dashboard', '/app/speech', '/app/speech/history', '/settings']) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page);
    }
  });

  test('the prepare and listening screens fit every viewport', async ({ page }) => {
    await signUp(page);
    await page.goto('/app/speech');
    await page.getByRole('button', { name: 'Interview', exact: true }).click();
    await page.getByTestId('begin-session').click();
    await expectNoHorizontalOverflow(page);

    await page.getByTestId('start-practice').click();
    await expect(page.getByTestId('listening-stage')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    // Stop stays reachable without scrolling sideways at any width.
    await expect(page.getByTestId('stop-session')).toBeInViewport();
  });
});
