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
