/** Structured feedback returned to the client. */
export interface LlmFeedback {
  analysis: string;
  suggested_actions: string[];
  /** 0..1 confidence the model reports in its own assessment. */
  confidence: number;
}

/** Providers the service can route to. `mock` is deterministic/offline. */
export type LlmProviderName = 'ollama' | 'gemini' | 'openai' | 'mock';

export const LLM_PROVIDERS: LlmProviderName[] = [
  'ollama',
  'gemini',
  'openai',
  'mock',
];

export interface LlmAnalyzeOptions {
  /** Provider override for this request (defaults to configured provider). */
  provider?: string;
  /** Model override for this request (defaults to the provider's model). */
  model?: string;
}

export interface LlmResult {
  feedback: LlmFeedback;
  /** Provider that actually produced the feedback. */
  provider: LlmProviderName;
  /** Model that actually produced the feedback. */
  model: string;
}
