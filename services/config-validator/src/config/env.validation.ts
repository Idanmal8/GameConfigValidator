/**
 * Fail-fast validation of the environment at boot. Keys are optional now —
 * providers activate on demand — so we only validate the default provider name.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const provider = (config.LLM_PROVIDER as string) ?? 'ollama';
  const allowed = ['ollama', 'gemini', 'openai', 'mock'];

  if (!allowed.includes(provider)) {
    throw new Error(
      `Invalid LLM_PROVIDER "${provider}". Expected one of: ${allowed.join(', ')}.`,
    );
  }

  return config;
}
