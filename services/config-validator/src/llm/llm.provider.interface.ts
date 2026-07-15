/** DI token for the active LLM provider implementation. */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/** Structured feedback returned to the client (matches the API contract). */
export interface LlmFeedback {
  analysis: string;
  suggested_actions: string[];
  /** 0..1 confidence the model reports in its own assessment. */
  confidence: number;
}

export interface LlmAnalyzeOptions {
  /** Optional per-request model override (bonus: model selection). */
  model?: string;
}

export interface LlmProvider {
  /** Human-readable provider name, surfaced in the response metadata. */
  readonly name: string;
  analyze(config: unknown, options?: LlmAnalyzeOptions): Promise<LlmFeedback>;
}
