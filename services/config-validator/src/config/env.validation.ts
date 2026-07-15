/**
 * Fail-fast validation of the environment at boot. Keeps misconfiguration
 * (e.g. selecting the Gemini provider without a key) from surfacing as an
 * opaque 500 on the first request.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const provider = (config.LLM_PROVIDER as string) ?? 'gemini';

  if (!['gemini', 'mock'].includes(provider)) {
    throw new Error(
      `Invalid LLM_PROVIDER "${provider}". Expected "gemini" or "mock".`,
    );
  }

  if (provider === 'gemini' && !config.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY is required when LLM_PROVIDER=gemini. ' +
        'Set it in your .env file (see .env.example) or switch LLM_PROVIDER=mock.',
    );
  }

  return config;
}
