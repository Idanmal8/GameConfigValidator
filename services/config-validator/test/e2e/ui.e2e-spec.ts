import { test, expect } from '@playwright/test';

test('UI loads and validates a config end-to-end', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Game Config Validator');

  // The textarea is pre-filled with the "reward too high" example.
  await page.getByRole('button', { name: 'Validate' }).click();

  const result = page.locator('#result');
  await expect(result).toContainText('valid', { timeout: 15_000 });
  await expect(result).toContainText(/confidence/i);
  await expect(result).toContainText(/reward/i);
});

test('UI surfaces schema errors for an invalid config', async ({ page }) => {
  await page.goto('/');
  await page.locator('#config').fill('{"level": 1, "difficulty": "nope"}');
  await page.getByRole('button', { name: 'Validate' }).click();

  const result = page.locator('#result');
  await expect(result).toContainText('invalid', { timeout: 15_000 });
});

test('shows an animated loader while validating, then clears it', async ({
  page,
}) => {
  await page.goto('/');
  // Delay the /validate response so the loading state is observable.
  await page.route('**/validate*', async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schema_validation: { valid: true, errors: [] },
        llm_feedback: {
          analysis: 'looks fine',
          suggested_actions: ['No action needed'],
          confidence: 0.9,
        },
        provider: 'mock',
        model: 'mock',
      }),
    });
  });

  await page.getByRole('button', { name: 'Validate' }).click();
  // spinner + busy button appear while the request is in flight
  await expect(page.locator('#result .spinner')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validating…' })).toBeVisible();
  // once resolved, the loader is gone and the result is shown
  await expect(page.locator('#result')).toContainText('valid', { timeout: 10_000 });
  await expect(page.locator('#result .spinner')).toHaveCount(0);
});

test('Tab inserts spaces instead of moving focus', async ({ page }) => {
  await page.goto('/');
  const ta = page.locator('#config');
  await ta.fill('ab');
  await ta.evaluate((el: HTMLTextAreaElement) => {
    el.selectionStart = el.selectionEnd = 1;
  });
  await ta.press('Tab');
  expect(await ta.inputValue()).toBe('a  b');
  await expect(ta).toBeFocused(); // focus stayed in the editor
});

test('Alt+ArrowDown moves the current line down', async ({ page }) => {
  await page.goto('/');
  const ta = page.locator('#config');
  await ta.fill('first\nsecond');
  await ta.evaluate((el: HTMLTextAreaElement) => {
    el.selectionStart = el.selectionEnd = 0; // caret on line 1
  });
  await ta.press('Alt+ArrowDown');
  expect(await ta.inputValue()).toBe('second\nfirst');
});

test('Format button prettifies JSON (tolerating a trailing comma)', async ({
  page,
}) => {
  await page.goto('/');
  const ta = page.locator('#config');
  await ta.fill('{"level":1,"time_limit":30,"reward":100,"difficulty":"easy",}');
  await page.getByRole('button', { name: 'Format' }).click();
  const v = await ta.inputValue();
  expect(v).toContain('\n');
  expect(v).toContain('"level": 1');
  expect(v).not.toContain(',}'); // trailing comma gone
});

test('UI highlights a trailing comma live and hints at it', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('#config')
    .fill('{\n  "level": 12,\n  "time_limit": 60,\n  "reward": 5000,\n}');

  // the offending comma is boxed in the backdrop overlay…
  await expect(page.locator('#highlights mark')).toHaveText(',');
  // …and a plain-language hint appears
  await expect(page.locator('#hint')).toContainText(/trailing comma/i);

  // a clean config clears the highlight
  await page
    .locator('#config')
    .fill('{"level":1,"time_limit":30,"reward":100,"difficulty":"easy"}');
  await expect(page.locator('#highlights mark')).toHaveCount(0);
  await expect(page.locator('#hint')).toHaveText('');
});
