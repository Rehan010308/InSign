import { expect, type Page, type TestInfo } from '@playwright/test';

/** Fails the test on any console error or page error that appears. */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Font CDN hiccups and devtools noise are not app errors.
    if (/fonts\.(googleapis|gstatic)\.com/.test(text)) return;
    if (/Failed to load resource.*favicon/.test(text)) return;
    errors.push(text);
  });
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth, 'page must not scroll horizontally')
    .toBeLessThanOrEqual(overflow.clientWidth + 1);
}

let seq = 0;

/** A fresh local-demo account per test, so tests never share state. */
export function uniqueEmail(prefix = 'tester'): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}-${Math.floor(Math.random() * 1e6)}@insign.test`;
}

export async function signUp(page: Page, email = uniqueEmail(), password = 'practice123') {
  await page.goto('/auth/signup');
  await page.getByLabel('NAME').fill('Test Person');
  await page.getByLabel('EMAIL').fill(email);
  await page.getByLabel('PASSWORD').fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('**/dashboard');
  return { email, password };
}

/** Seeds speech sessions directly into the local demo store. */
export async function seedSpeechSessions(
  page: Page,
  rows: Array<{
    scenario: string;
    transcript?: string | null;
    duration_ms: number;
    words_per_minute: number;
    pause_count: number;
    repetition_count: number;
    filler_count: number;
    daysAgo?: number;
  }>
) {
  await page.evaluate(seedRows => {
    const userId = JSON.parse(localStorage.getItem('insign.local.session') || 'null');
    const key = 'insign.local.speech_sessions';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    for (const r of seedRows) {
      const created = new Date(Date.now() - (r.daysAgo ?? 1) * 86400000).toISOString();
      existing.push({
        id: 'seed-' + Math.random().toString(36).slice(2),
        user_id: userId,
        created_at: created,
        scenario: r.scenario,
        transcript: r.transcript ?? 'seeded session',
        duration_ms: r.duration_ms,
        words_per_minute: r.words_per_minute,
        pause_count: r.pause_count,
        repetition_count: r.repetition_count,
        filler_count: r.filler_count,
      });
    }
    localStorage.setItem(key, JSON.stringify(existing));
  }, rows);
}

/**
 * The app nav collapses behind a MENU button at narrow viewports; open it so a
 * test can reach the same links it uses on a desktop viewport.
 */
export async function openAppMenu(page: Page) {
  const toggle = page.getByRole('button', { name: 'MENU' });
  if (await toggle.isVisible().catch(() => false)) await toggle.click();
}

export async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({
    path: `tests/screenshots/${info.project.name}/${name}.png`,
    fullPage: true,
  });
}
