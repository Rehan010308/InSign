import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, trackConsoleErrors } from './helpers';

test.describe('landing page', () => {
  test('renders the nine-chapter story with no console errors', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Technology');
    for (const id of ['#hero', '#idea', '#speech', '#adaptation', '#sign', '#movement', '#technology', '#philosophy', '#contact']) {
      await expect(page.locator(id)).toHaveCount(1);
    }
    await expect(page.locator('#bg')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('has exactly one h1 and a skip link', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('a.skip')).toHaveAttribute('href', '#main');
  });

  test('nav anchors scroll the target below the sticky bar', async ({ page }) => {
    await page.goto('/');
    // The header links are hidden on narrow viewports by design; the footer nav
    // carries the same anchors there, so the behaviour is tested either way.
    const headerVisible = await page.locator('#nav').getByRole('link', { name: 'SPEECH', exact: true })
      .isVisible().catch(() => false);
    const source = headerVisible ? page.locator('#nav') : page.locator('footer');

    for (const label of ['SPEECH', 'SIGN', 'PHILOSOPHY']) {
      await source.getByRole('link', { name: label, exact: true }).click();
      // Smooth scrolling takes as long as the distance demands, which on a
      // phone-height page is well over a second. Reset the sampler each time,
      // or the previous anchor's settled state satisfies this immediately.
      await page.evaluate(() => {
        const w = window as unknown as { __lastY?: number; __still?: number };
        w.__lastY = -1;
        w.__still = 0;
      });
      await page.waitForFunction(() => {
        const w = window as unknown as { __lastY?: number; __still?: number };
        const y = Math.round(window.scrollY);
        if (w.__lastY === y) { w.__still = (w.__still ?? 0) + 1; } else { w.__still = 0; }
        w.__lastY = y;
        return (w.__still ?? 0) > 3;
      }, null, { timeout: 10_000, polling: 100 });
      const id = label.toLowerCase();
      const top = await page.locator(`#${id}`).evaluate(el => el.getBoundingClientRect().top);
      expect(top, `${label} should land below the 84px nav`).toBeGreaterThanOrEqual(-2);
      expect(top).toBeLessThan(200);
    }
  });

  test('Try InSign routes to sign-up', async ({ page }) => {
    await page.goto('/');
    await page.locator('#nav').getByRole('link', { name: /try insign/i }).click();
    await expect(page).toHaveURL(/\/auth\/signup/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Start where');
  });

  test('theme toggle flips data-theme, persists, and notifies the background', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      (window as unknown as { __themeEvents: number }).__themeEvents = 0;
      document.addEventListener('insign:theme', () => {
        (window as unknown as { __themeEvents: number }).__themeEvents++;
      });
    });

    await page.getByRole('button', { name: /switch to light theme/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => (window as unknown as { __themeEvents: number }).__themeEvents)).toBeGreaterThan(0);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: /switch to dark theme/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('contact email is a modest mailto link, not a giant heading', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('a.email-link');
    await expect(link).toHaveAttribute('href', 'mailto:rehan.badar0103@gmail.com');
    const size = await link.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeLessThanOrEqual(20);
  });

  test('no horizontal overflow in either theme', async ({ page }) => {
    await page.goto('/');
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: /switch to light theme/i }).click();
    await page.waitForTimeout(700);
    await expectNoHorizontalOverflow(page);
  });

  test('canvases actually paint', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1200);
    const bgPainted = await page.locator('#bg').evaluate((cv: HTMLCanvasElement) => {
      const ctx = cv.getContext('2d');
      if (!ctx) return false;
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) return true;
      return false;
    });
    expect(bgPainted, 'signal background should have non-zero pixels').toBe(true);

    await page.locator('#movement').scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    const mvPainted = await page.locator('#mv-canvas').evaluate((cv: HTMLCanvasElement) => {
      const ctx = cv.getContext('2d');
      if (!ctx) return false;
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 3; i < d.length; i += 4 * 31) if (d[i] > 0) return true;
      return false;
    });
    expect(mvPainted, 'movement canvas should have non-zero pixels').toBe(true);
  });

  test('scroll story and pipelines wake up', async ({ page }) => {
    await page.goto('/');
    await page.locator('#speech').scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(1200);
    await expect(page.locator('.sflow-stage.on').first()).toBeVisible();

    await page.locator('#technology').scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await expect(page.locator('.pipe-flow').first()).toBeVisible();
    await expect(page.locator('#movement .mv-replay')).toBeVisible();
  });

  test('footer links work', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer a.fmail')).toHaveAttribute('href', 'mailto:rehan.badar0103@gmail.com');
    await page.locator('footer').getByRole('link', { name: 'CONTACT' }).click();
    await page.waitForTimeout(600);
    await expect(page.locator('#contact')).toBeInViewport();
  });
});
