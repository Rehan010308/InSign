import { test } from '@playwright/test';
import { openAppMenu, seedSpeechSessions, shot, signUp } from './helpers';

/**
 * Visual QA pass: every surface, every viewport, both themes. Run with
 *   npx playwright test tests/e2e/screenshots.spec.ts
 * and look at tests/screenshots/ afterwards.
 */
for (const theme of ['dark', 'light'] as const) {
  test(`screenshots · ${theme}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.addInitScript(t => {
      try { localStorage.setItem('insign-theme', t); } catch { /* ignore */ }
    }, theme);

    await page.goto('/');
    await page.waitForTimeout(1200);
    await shot(page, info, `${theme}-01-landing-hero`);

    for (const id of ['idea', 'speech', 'adaptation', 'sign', 'movement', 'technology', 'philosophy', 'contact']) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `tests/screenshots/${info.project.name}/${theme}-02-landing-${id}.png` });
    }

    await page.goto('/auth/signup');
    await shot(page, info, `${theme}-03-signup`);

    await signUp(page);
    await seedSpeechSessions(page, [
      { scenario: 'interview', duration_ms: 120000, words_per_minute: 118, pause_count: 14, repetition_count: 3, filler_count: 6, daysAgo: 1 },
      { scenario: 'interview', duration_ms: 120000, words_per_minute: 120, pause_count: 13, repetition_count: 2, filler_count: 5, daysAgo: 3 },
      { scenario: 'interview', duration_ms: 120000, words_per_minute: 121, pause_count: 15, repetition_count: 4, filler_count: 7, daysAgo: 6 },
      { scenario: 'conversation', duration_ms: 90000, words_per_minute: 132, pause_count: 3, repetition_count: 1, filler_count: 2, daysAgo: 2 },
    ]);

    await page.goto('/dashboard');
    await page.waitForTimeout(600);
    await shot(page, info, `${theme}-04-dashboard`);

    await page.goto('/app/speech');
    await page.waitForTimeout(400);
    await shot(page, info, `${theme}-05-scenarios`);

    await page.getByRole('button', { name: 'Interview', exact: true }).click();
    await page.getByRole('button', { name: /how speech is processed/i }).click();
    await shot(page, info, `${theme}-06-speech-disclosure`);

    await page.getByTestId('begin-session').click();
    await page.waitForTimeout(400);
    await shot(page, info, `${theme}-07-speech-question`);

    await page.getByTestId('start-practice').click();
    await page.waitForTimeout(500);
    await shot(page, info, `${theme}-08-speech-listening`);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.goto('/app/speech/history');
    await page.waitForTimeout(500);
    await shot(page, info, `${theme}-09-history`);

    await page.goto('/settings');
    await page.waitForTimeout(400);
    await shot(page, info, `${theme}-10-settings`);

    await page.goto('/app/sign');
    await page.waitForTimeout(500);
    await shot(page, info, `${theme}-11-sign-idle`);

    await page.getByTestId('enable-camera').click();
    await page.waitForFunction(() => '__insignSignPipeline' in window, null, { timeout: 30_000 });
    await page.waitForTimeout(1500);
    await shot(page, info, `${theme}-12-sign-live`);

    await openAppMenu(page);
    await page.waitForTimeout(200);
    await shot(page, info, `${theme}-13-nav-open`);

    await page.goto('/nope');
    await shot(page, info, `${theme}-14-not-found`);
  });
}
