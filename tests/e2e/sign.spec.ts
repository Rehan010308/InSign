import { expect, test, type Page } from '@playwright/test';
import { openAppMenu, signUp, trackConsoleErrors } from './helpers';
import { SEQUENCES, unknownSequence } from '../fixtures/signSequences';
import type { LandmarkFrame } from '../../src/lib/sign/kalman';

/** Waits for the injection hook the sign page exposes for the suite. */
async function waitForHook(page: Page) {
  await page.waitForFunction(() => '__insignSignPipeline' in window, null, { timeout: 15_000 });
}

/** Feeds recorded landmark frames through the real pipeline. */
async function feed(page: Page, frames: LandmarkFrame[], repeats = 1, handCount = 1) {
  await page.evaluate(
    async ({ frames: f, repeats: r, handCount: h }) => {
      const api = (window as unknown as {
        __insignSignPipeline: {
          pauseLive(): void;
          feedFrames(frames: unknown[], handCount?: number): Promise<void>;
        };
      }).__insignSignPipeline;
      api.pauseLive();
      for (let i = 0; i < r; i++) await api.feedFrames(f, h);
    },
    { frames, repeats, handCount }
  );
}

async function openSignPage(page: Page) {
  await signUp(page);
  await page.goto('/app/sign');
  await expect(page.getByTestId('vocab-badge')).toContainText('8 SIGNS');
}

test.describe('sign translator', () => {
  // Loading the hand model and spinning up a GPU graph is genuinely slow,
  // especially with several browsers competing for the device.
  test.setTimeout(90_000);

  test('explains itself before asking for the camera, and asks only on request', async ({ page }) => {
    await openSignPage(page);
    await expect(page.getByTestId('enable-camera')).toBeVisible();
    await expect(page.getByText(/frames are processed locally and never uploaded/i)).toBeVisible();

    // Nothing may be requested until the user presses the button.
    const tracks = await page.evaluate(() => {
      const v = document.querySelector('video') as HTMLVideoElement | null;
      return v?.srcObject ? 1 : 0;
    });
    expect(tracks).toBe(0);
  });

  test('enabling the camera starts the video and the landmark overlay', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();

    await expect(page.getByTestId('sign-video')).toBeVisible();
    await page.waitForFunction(() => {
      const v = document.querySelector('video') as HTMLVideoElement | null;
      return !!v?.srcObject && v.readyState >= 2;
    }, null, { timeout: 20_000 });

    await waitForHook(page);
    // The overlay canvas is sized to the stage and the model reports its delegate.
    const size = await page.getByTestId('sign-overlay').evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
    expect(size.w).toBeGreaterThan(100);
    expect(size.h).toBeGreaterThan(100);
    await expect(page.getByText(/GPU DELEGATE|CPU DELEGATE/)).toBeVisible({ timeout: 20_000 });

    expect(errors.filter(e => !/mediapipe|wasm|GL |WebGL/i.test(e))).toEqual([]);
  });

  test('a recognised sign reaches the output strip with its confidence', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await waitForHook(page);

    await feed(page, SEQUENCES.HELLO(), 3);

    await expect(page.getByTestId('sign-strip')).toContainText('HELLO', { timeout: 10_000 });
    await expect(page.getByTestId('sign-strip')).toContainText(/0\.\d\d/);
    const confidence = await page.getByTestId('confidence-value').textContent();
    expect(Number(confidence)).toBeGreaterThanOrEqual(0.75);
  });

  test('draws raw and stabilized landmarks at the same time', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await waitForHook(page);
    await feed(page, SEQUENCES.HELLO(), 1);

    await expect(page.getByText('RAW LANDMARKS')).toBeVisible();
    await expect(page.getByText('STABILIZED')).toBeVisible();

    // The overlay must actually contain two differently-coloured skeletons: the
    // dim raw one and the amber stabilized one.
    const colors = await page.getByTestId('sign-overlay').evaluate((cv: HTMLCanvasElement) => {
      const ctx = cv.getContext('2d')!;
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let amber = 0;
      let dim = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
        if (a < 20) continue;
        if (r > 180 && g > 120 && g < 200 && b < 110) amber++;
        else if (Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && r > 150) dim++;
      }
      return { amber, dim };
    });
    expect(colors.amber, 'stabilized landmarks should be drawn in amber').toBeGreaterThan(50);
    expect(colors.dim, 'raw landmarks should be drawn dim and neutral').toBeGreaterThan(20);
  });

  test('an unknown movement says so instead of inventing a sign', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await waitForHook(page);

    await feed(page, unknownSequence(), 3);

    await expect(page.getByTestId('decision-chip')).toContainText('MOVEMENT UNCLEAR', { timeout: 10_000 });
    await expect(page.getByTestId('sign-strip')).toContainText('NOTHING RECOGNISED YET');
  });

  test('no hand in view is reported as a tracking state', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await waitForHook(page);

    await page.evaluate(() => {
      const api = (window as unknown as {
        __insignSignPipeline: { pauseLive(): void; feedNoHand(): void };
      }).__insignSignPipeline;
      api.pauseLive();
      api.feedNoHand();
    });

    await expect(page.getByTestId('tracking-chip')).toContainText('NO HAND IN VIEW');
  });

  test('two hands are disclosed rather than silently merged', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await waitForHook(page);
    await feed(page, SEQUENCES.YES(), 1, 2);
    await expect(page.getByTestId('tracking-chip')).toContainText('TWO HANDS');
  });

  test('Clear empties the output strip', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await waitForHook(page);
    await feed(page, SEQUENCES.HELLO(), 3);
    await expect(page.getByTestId('sign-strip')).toContainText('HELLO', { timeout: 10_000 });

    await page.getByTestId('clear-signs').click();
    await expect(page.getByTestId('sign-strip')).toContainText('NOTHING RECOGNISED YET');
  });

  test('leaving the route stops every camera track', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await page.waitForFunction(() => {
      const v = document.querySelector('video') as HTMLVideoElement | null;
      return !!v?.srcObject;
    }, null, { timeout: 20_000 });

    // Keep a handle on the tracks so we can prove they ended, not just detached.
    await page.evaluate(() => {
      const v = document.querySelector('video') as HTMLVideoElement;
      (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks =
        (v.srcObject as MediaStream).getTracks();
    });

    await openAppMenu(page);
    await page.getByRole('link', { name: 'DASHBOARD' }).click();
    await page.waitForURL('**/dashboard');

    // React commits the unmount a tick after the URL changes, so poll rather
    // than sampling a single instant.
    await expect.poll(
      () => page.evaluate(() =>
        (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks.map(t => t.readyState)),
      { timeout: 5_000 }
    ).toEqual(expect.arrayContaining(['ended']));

    const states = await page.evaluate(() =>
      (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks.map(t => t.readyState));
    expect(states.length).toBeGreaterThan(0);
    expect(states.every(s => s === 'ended'), `tracks: ${states.join()}`).toBe(true);
    expect(await page.locator('video').count()).toBe(0);
  });

  test('the vocabulary is listed honestly, ambiguity included', async ({ page }) => {
    await openSignPage(page);
    await page.getByRole('button', { name: /show the vocabulary/i }).click();
    for (const sign of ['HELLO', 'THANK YOU', 'YES', 'NO', 'HELP', 'PLEASE', 'SORRY', 'GOOD']) {
      await expect(page.locator('.chip').filter({ hasText: new RegExp(`^${sign}$`) })).toBeVisible();
    }
    await expect(page.getByText(/THANK YOU AND GOOD SHARE A HAND SHAPE/i)).toBeVisible();
  });
});

test.describe('sign translator without a camera', () => {
  test.use({ permissions: [] });
  test.setTimeout(90_000);

  test('a denied camera explains how to recover and does not crash the app', async ({ page, context }) => {
    await context.clearPermissions();
    await page.addInitScript(() => {
      // Deny at the API level: Chromium's fake device would otherwise auto-accept.
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();

    await expect(page.getByText('Camera access was blocked.')).toBeVisible();
    await expect(page.getByText(/allow the camera for this site/i)).toBeVisible();
    await expect(page.getByTestId('retry-camera')).toBeVisible();

    // The app shell survives.
    await openAppMenu(page);
    await page.getByRole('link', { name: 'DASHBOARD' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back');
  });
});
