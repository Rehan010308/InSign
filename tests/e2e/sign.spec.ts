import { expect, test, type Page } from '@playwright/test';
import { openAppMenu, signUp, trackConsoleErrors } from './helpers';
import { SEQUENCES, moreSecondHand, unknownSequence } from '../fixtures/signSequences';
import type { LandmarkFrame } from '../../src/lib/sign/kalman';

/** Waits for the injection hook the sign page exposes for the suite. */
async function waitForHook(page: Page) {
  await page.waitForFunction(() => '__insignSignPipeline' in window, null, { timeout: 15_000 });
}

interface PipelineApi {
  pauseLive(): void;
  isFrozen(): boolean;
  feedFrames(
    frames: unknown[], handCount?: number, handLabel?: string | null,
    aspect?: number, second?: unknown[] | null
  ): Promise<void>;
  feedNoHand(): void;
}

/** Feeds recorded landmark frames through the real pipeline. */
async function feed(
  page: Page,
  frames: LandmarkFrame[],
  repeats = 1,
  handCount = 1,
  second: LandmarkFrame[] | null = null
) {
  await page.evaluate(
    async ({ frames: f, repeats: r, handCount: h, second: s }) => {
      const api = (window as unknown as { __insignSignPipeline: PipelineApi }).__insignSignPipeline;
      api.pauseLive();
      for (let i = 0; i < r; i++) await api.feedFrames(f, h, 'Right', 1, s);
    },
    { frames, repeats, handCount, second }
  );
}

async function openSignPage(page: Page) {
  await signUp(page);
  await page.goto('/app/sign');
  await expect(page.getByTestId('vocab-badge')).toContainText('10 SIGNS');
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

    const legend = page.getByTestId('sign-stage');
    await expect(legend.getByText('RAW LANDMARKS')).toBeVisible();
    await expect(legend.getByText('STABILIZED')).toBeVisible();

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
    await expect(page.getByTestId('sign-strip')).toContainText('NOTHING COMMITTED YET');
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
    await expect(page.getByTestId('tracking-chip')).toContainText('TWO HANDS TRACKED');
  });

  test('Clear empties the output strip', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await waitForHook(page);
    await feed(page, SEQUENCES.HELLO(), 3);
    await expect(page.getByTestId('sign-strip')).toContainText('HELLO', { timeout: 10_000 });

    await page.getByTestId('clear-signs').click();
    await expect(page.getByTestId('sign-strip')).toContainText('NOTHING COMMITTED YET');
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

  test('shows the pipeline stages and a real raw-vs-stabilized trace', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await waitForHook(page);

    const strip = page.getByTestId('pipeline-strip');
    await expect(strip).toContainText('RAW MOVEMENT');
    await expect(strip).toContainText('KALMAN STABILIZATION');
    await expect(strip).toContainText('TEMPORAL CLASSIFIER');
    await expect(strip).toContainText('COMMITTED SIGN');

    // Feed a visibly shaky hand and check the trace canvas actually drew two
    // different lines from it.
    const shaky = SEQUENCES.HELLO().map((f, i) =>
      f.map(p => ({ x: p.x + (i % 2 ? 0.004 : -0.004), y: p.y + (i % 2 ? 0.005 : -0.005), z: p.z })));
    await feed(page, shaky, 2);

    const ink = await page.getByTestId('sign-trace').evaluate((cv: HTMLCanvasElement) => {
      const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
      let painted = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 20) painted++;
      return painted;
    });
    expect(ink, 'the trace must be drawn from real landmark data').toBeGreaterThan(100);
    await expect(page.getByTestId('jitter-readout')).toContainText(/jitter/i);
  });

  test('a low-confidence gesture is named as uncertain, never committed', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await waitForHook(page);

    await feed(page, unknownSequence(), 3);

    await expect(page.getByTestId('recognised-word')).toContainText('UNCERTAIN');
    await expect(page.getByTestId('recognised-status')).toContainText(/NOT CONFIDENT ENOUGH/i);
    await expect(page.getByTestId('sign-strip')).toContainText('NOTHING COMMITTED YET');
  });

  test('a committed sign reports itself as stable', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await waitForHook(page);
    await feed(page, SEQUENCES.SORRY(), 3);

    await expect(page.getByTestId('recognised-word')).toContainText('SORRY', { timeout: 10_000 });
    await expect(page.getByTestId('recognised-status')).toContainText(/STABLE|CONFIRMING/);
    const stability = await page.getByTestId('stability-value').textContent();
    expect(Number(stability!.replace('%', ''))).toBeGreaterThan(0);
  });

  test('Stop freezes recognition, and later frames cannot change the result', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await waitForHook(page);

    await feed(page, SEQUENCES.HELLO(), 3);
    await expect(page.getByTestId('sign-strip')).toContainText('HELLO', { timeout: 10_000 });
    const before = await page.getByTestId('sign-strip').textContent();

    await page.getByTestId('end-session').click();
    await expect(page.getByTestId('frozen-note')).toBeVisible();
    expect(await page.evaluate(() =>
      (window as unknown as { __insignSignPipeline: PipelineApi }).__insignSignPipeline.isFrozen()
    )).toBe(true);

    // Keep signing after Stop: a completely different sign, several times over.
    await feed(page, SEQUENCES.SORRY(), 4);
    await feed(page, SEQUENCES.YES(), 4);

    await expect(page.getByTestId('sign-strip')).toHaveText(before!.trim());
    await expect(page.getByTestId('sign-strip')).not.toContainText('SORRY');
    await expect(page.getByTestId('sign-strip')).not.toContainText('YES');
  });

  test('Stop releases the camera', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await page.waitForFunction(() => {
      const v = document.querySelector('video') as HTMLVideoElement | null;
      return !!v?.srcObject;
    }, null, { timeout: 20_000 });
    await waitForHook(page);

    await page.evaluate(() => {
      const v = document.querySelector('video') as HTMLVideoElement;
      (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks =
        (v.srcObject as MediaStream).getTracks();
    });

    await page.getByTestId('end-session').click();
    await expect.poll(
      () => page.evaluate(() =>
        (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks.every(t => t.readyState === 'ended')),
      { timeout: 5_000 }
    ).toBe(true);
  });

  test('a held sign is committed once, not once per pass', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await waitForHook(page);

    // The same gesture, over and over, with no release in between.
    await feed(page, SEQUENCES.HELLO(), 6);
    await expect(page.getByTestId('sign-strip')).toContainText('HELLO', { timeout: 10_000 });

    const hellos = await page.getByTestId('sign-strip').evaluate(el =>
      (el.textContent ?? '').match(/HELLO/g)?.length ?? 0);
    expect(hellos, 'a continuously held sign must not repeat itself').toBe(1);
  });

  test('a two-handed sign needs both hands', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await waitForHook(page);

    // One hand doing MORE's handshape commits nothing.
    await feed(page, SEQUENCES.MORE(), 3);
    await expect(page.getByTestId('sign-strip')).toContainText('NOTHING COMMITTED YET');

    // Both hands, tapping together, does.
    await feed(page, SEQUENCES.MORE(), 3, 2, moreSecondHand());
    await expect(page.getByTestId('sign-strip')).toContainText('MORE', { timeout: 10_000 });
  });

  test('a sequence of different signs is kept in order', async ({ page }) => {
    await openSignPage(page);
    await page.getByTestId('enable-camera').click();
    await waitForHook(page);

    await feed(page, SEQUENCES.HELLO(), 3);
    await expect(page.getByTestId('sign-strip')).toContainText('HELLO', { timeout: 10_000 });
    await feed(page, SEQUENCES.SORRY(), 3);
    await expect(page.getByTestId('sign-strip')).toContainText('SORRY', { timeout: 10_000 });

    const text = (await page.getByTestId('sign-strip').textContent()) ?? '';
    expect(text.indexOf('HELLO')).toBeLessThan(text.indexOf('SORRY'));
  });

  test('the vocabulary is listed honestly, ambiguity included', async ({ page }) => {
    await openSignPage(page);
    await page.getByRole('button', { name: /show the vocabulary/i }).click();
    for (const sign of ['HELLO', 'THANK YOU', 'YES', 'NO', 'HELP', 'PLEASE', 'SORRY', 'GOOD', 'I LOVE YOU', 'MORE']) {
      await expect(page.locator('.chip').filter({ hasText: new RegExp(`^${sign}$`) })).toBeVisible();
    }
    await expect(page.getByText(/THANK YOU AND GOOD SHARE A\s+HAND SHAPE/i)).toBeVisible();
    await expect(page.getByText(/NOT SIGN LANGUAGE TRANSLATION/i)).toBeVisible();
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
