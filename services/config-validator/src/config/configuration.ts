export interface AppConfig {
  port: number;
  llm: {
    provider: string;
    /** Hard cap per LLM request (ms); bounds hung providers. */
    timeoutMs: number;
    gemini: { apiKey: string; model: string };
    openai: { apiKey: string; model: string };
    ollama: { baseUrl: string; model: string };
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  llm: {
    // Default to the local, keyless Ollama provider so the service runs with
    // zero secrets. Cloud providers activate only when their key is set.
    provider: process.env.LLM_PROVIDER ?? 'ollama',
    // Generous enough for a first-run local Ollama inference, but bounded.
    timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS ?? '60000', 10),
    gemini: {
      apiKey: process.env.GEMINI_API_KEY ?? '',
      model: process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY ?? '',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL ?? 'llama3.2',
    },
  },
});
