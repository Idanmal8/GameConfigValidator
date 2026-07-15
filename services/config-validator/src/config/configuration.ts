export interface AppConfig {
  port: number;
  llm: {
    provider: 'gemini' | 'mock';
    gemini: {
      apiKey: string;
      model: string;
      baseUrl: string;
    };
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  llm: {
    provider: (process.env.LLM_PROVIDER as 'gemini' | 'mock') ?? 'gemini',
    gemini: {
      apiKey: process.env.GEMINI_API_KEY ?? '',
      model: process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite',
      baseUrl:
        process.env.GEMINI_BASE_URL ??
        'https://generativelanguage.googleapis.com/v1beta',
    },
  },
});
