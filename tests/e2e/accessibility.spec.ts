import { expect, test, type Page } from '@playwright/test';
import { signUp } from './helpers';

/** Relative luminance per WCAG 2.1. */
function luminance([r, g, b]: number[]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg: number[], bg: number[]): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** The theme crossfade leaves the body semi-transparent for 600ms after load. */
async function waitForThemeSettled(page: Page) {
  await page.waitForFunction(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const parts = (bg.match(/[\d.]+/g) ?? []).map(Number);
    return parts.length < 4 || parts[3] > 0.99;
  }, null, { timeout: 5_000 });
}

/** Resolves an element's colour against whatever is actually painted behind it. */
async function colorPair(page: Page, selector: string) {
  return page.locator(selector).first().evaluate(el => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
    const fg = parse(getComputedStyle(el).color);
    let node: HTMLElement | null = el as HTMLElement;
    let bg = [255, 255, 255];
    while (node) {
      const c = getComputedStyle(node).backgroundColor;
      const rgba = (c.match(/[\d.]+/g) ?? []).map(Number);
      if (rgba.length >= 3 && (rgba.length < 4 || rgba[3] > 0.9)) { bg = rgba.slice(0, 3); break; }
      node = node.parentElement;
    }
    return { fg, bg, fontSize: parseFloat(getComputedStyle(el).fontSize) };
  });
}

test.describe('accessibility', () => {
  test('landing page has landmarks, one h1, and ordered headings', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toHaveCount(1);
    await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(1);
    await expect(page.locator('main#main')).toHaveCount(1);
    await expect(page.locator('footer')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);

    const levels = await page.locator('h1, h2, h3, h4, h5').evaluateAll(
      els => els.map(e => Number(e.tagName[1]))
    );
    expect(levels[0]).toBe(1);
    // No heading level is skipped on the way down.
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
  });

  test('every app page has exactly one h1 and a main landmark', async ({ page }) => {
    await signUp(page);
    for (const path of ['/dashboard', '/app/speech', '/app/speech/history', '/settings', '/app/sign']) {
      await page.goto(path);
      await expect(page.locator('main#main'), path).toHaveCount(1);
      await expect(page.locator('h1'), path).toHaveCount(1);
    }
  });

  test('the skip link is reachable and focusable first', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(focused).toContain('skip');
  });

  test('keyboard alone reaches the nav, the theme toggle and the CTA', async ({ page }) => {
    await page.goto('/');
    const reached: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      reached.push(await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return '';
        return (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40);
      }));
    }
    expect(reached.join('|')).toContain('SPEECH');
    expect(reached.join('|')).toMatch(/theme/i);
    expect(reached.join('|')).toMatch(/Try InSign/i);
  });

  test('focused elements show a visible focus ring', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor };
    });
    expect(parseFloat(outline.width)).toBeGreaterThan(0);
    expect(outline.style).not.toBe('none');
  });

  test('live regions exist for the transcript and the sign output', async ({ page }) => {
    await signUp(page);
    await page.goto('/app/speech');
    await page.getByRole('button', { name: 'Interview' }).click();
    await page.getByRole('button', { name: /type my transcript/i }).click();
    await page.getByTestId('begin-session').click();
    await expect(page.getByTestId('speech-state')).toHaveAttribute('role', 'status');

    await page.goto('/app/sign');
    await expect(page.getByTestId('sign-strip')).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByTestId('tracking-chip')).toHaveAttribute('role', 'status');
  });

  test('icon-only controls carry labels', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: /switch to (light|dark) theme/i });
    await expect(toggle).toHaveAttribute('aria-pressed', /true|false/);
  });

  test('body text meets 4.5:1 in dark mode', async ({ page }) => {
    await page.goto('/');
    await waitForThemeSettled(page);
    const lede = await colorPair(page, '.hero-sub');
    expect(contrast(lede.fg, lede.bg)).toBeGreaterThanOrEqual(4.5);
  });

  test('body text meets 4.5:1 in light mode', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /switch to light theme/i }).click();
    await page.waitForTimeout(700);
    await waitForThemeSettled(page);
    const lede = await colorPair(page, '.hero-sub');
    expect(contrast(lede.fg, lede.bg)).toBeGreaterThanOrEqual(4.5);
  });

  test('the amber accent stays legible on ivory', async ({ page }) => {
    await signUp(page);
    await page.goto('/');
    await page.getByRole('button', { name: /switch to light theme/i }).click();
    await page.waitForTimeout(700);
    await waitForThemeSettled(page);
    const overline = await colorPair(page, '.overline b');
    // Small mono text: it has to clear the 4.5:1 body-text bar, not the large-text one.
    expect(contrast(overline.fg, overline.bg)).toBeGreaterThanOrEqual(4.5);
  });

  test('visualisations have text alternatives', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#mv-canvas')).toHaveAttribute('aria-label', /.{20,}/);
    await expect(page.locator('#story-wave')).toHaveAttribute('aria-label', /.+/);
    // Purely decorative canvases are hidden from the accessibility tree.
    await expect(page.locator('#bg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('the sign stage explains the camera before requesting it', async ({ page }) => {
    await signUp(page);
    await page.goto('/app/sign');
    const explanation = page.getByText(/InSign needs the camera to see your hand/i);
    await expect(explanation).toBeVisible();
    await expect(page.getByTestId('enable-camera')).toBeVisible();
  });
});
