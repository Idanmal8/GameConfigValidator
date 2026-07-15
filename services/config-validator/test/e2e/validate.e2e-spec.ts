import { test, expect } from '@playwright/test';

// These run against a server booted with LLM_PROVIDER=mock (see playwright.config.ts),
// so responses are deterministic and require no API key.

test('valid easy/high-reward config returns schema + LLM feedback', async ({
  request,
}) => {
  const res = await request.post('/validate', {
    data: { level: 12, time_limit: 60, reward: 5000, difficulty: 'easy' },
  });
  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  expect(body.schema_validation).toEqual({ valid: true, errors: [] });
  expect(body.llm_feedback.analysis).toMatch(/reward/i);
  expect(Array.isArray(body.llm_feedback.suggested_actions)).toBeTruthy();
  expect(body.llm_feedback.confidence).toBeGreaterThan(0);
  expect(body.provider).toBe('mock');
  expect(body.model).toBe('mock');
});

test('invalid config returns schema errors and null llm_feedback', async ({
  request,
}) => {
  const res = await request.post('/validate', {
    data: { level: 1, difficulty: 'impossible' },
  });
  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  expect(body.schema_validation.valid).toBe(false);
  expect(body.schema_validation.errors.length).toBeGreaterThan(0);
  expect(body.llm_feedback).toBeNull();
});

test('trailing comma + missing field yields a readable "is required" error', async ({
  request,
}) => {
  const res = await request.post('/validate', {
    headers: { 'content-type': 'application/json' },
    // deleting `difficulty` leaves a trailing comma; Buffer sends bytes raw
    data: Buffer.from('{"level":12,"time_limit":60,"reward":5000,}'),
  });
  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  expect(body.schema_validation.valid).toBe(false);
  expect(body.schema_validation.errors.join(' ')).toMatch(/difficulty: is required/);
  expect(body.llm_feedback).toBeNull();
});

test('genuinely broken JSON returns a friendly, located message', async ({
  request,
}) => {
  const res = await request.post('/validate', {
    headers: { 'content-type': 'application/json' },
    data: Buffer.from('{"level":12,"time_limit":}'),
  });
  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  expect(body.schema_validation.valid).toBe(false);
  expect(body.schema_validation.errors[0]).toMatch(/Invalid JSON/i);
  expect(body.schema_validation.errors[0]).toMatch(/Common causes/i);
});

test('provider + model query params are accepted', async ({ request }) => {
  const res = await request.post('/validate?provider=mock&model=mock', {
    data: { level: 1, time_limit: 120, reward: 100, difficulty: 'easy' },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.schema_validation.valid).toBe(true);
  expect(body.provider).toBe('mock');
});

test('selecting a provider with no key configured returns a clear error', async ({
  request,
}) => {
  // The e2e server runs with no OPENAI_API_KEY, so openai is unconfigured.
  const res = await request.post('/validate?provider=openai', {
    data: { level: 1, time_limit: 120, reward: 100, difficulty: 'easy' },
  });
  const body = await res.json();
  // schema passes; the LLM step fails with a helpful 400-style message
  expect(body.message ?? JSON.stringify(body)).toMatch(/OPENAI_API_KEY|not configured/i);
});
