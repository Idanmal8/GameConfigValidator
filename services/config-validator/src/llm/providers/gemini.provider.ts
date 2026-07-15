import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmAnalyzeOptions,
  LlmFeedback,
  LlmProvider,
} from '../llm.provider.interface';
import { SYSTEM_PROMPT, buildUserPrompt, parseFeedback } from '../prompt';

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

@Injectable()
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly BASE_DELAY_MS = 600;
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(private readonly config: ConfigService) {}

  async analyze(
    config: unknown,
    options: LlmAnalyzeOptions = {},
  ): Promise<LlmFeedback> {
    const apiKey = this.config.get<string>('llm.gemini.apiKey');
    const baseUrl = this.config.get<string>('llm.gemini.baseUrl');
    const model =
      options.model?.trim() ||
      this.config.get<string>('llm.gemini.model') ||
      'gemini-3.1-flash-lite';

    const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(config) }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    };

    const response = await this.fetchWithRetry(url, body, model);

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return parseFeedback(text);
  }

  /**
   * Gemini (especially the newest models on the free tier) returns transient
   * 429 (rate limit) and 503 (overloaded) errors under load. Retry those with
   * exponential backoff; fail fast on everything else.
   */
  private async fetchWithRetry(
    url: string,
    body: unknown,
    model: string,
  ): Promise<Response> {
    const maxAttempts = GeminiProvider.MAX_ATTEMPTS;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        // Network-level failure — retry if attempts remain.
        if (attempt < maxAttempts) {
          await this.backoff(attempt);
          continue;
        }
        this.logger.error(`Failed to reach Gemini API: ${String(err)}`);
        throw new HttpException(
          'Failed to reach the Gemini API.',
          HttpStatus.BAD_GATEWAY,
        );
      }

      if (response.ok) {
        return response;
      }

      const detail = await response.text().catch(() => '');
      const retryable = response.status === 429 || response.status === 503;

      if (retryable && attempt < maxAttempts) {
        this.logger.warn(
          `Gemini ${response.status} for model "${model}" (attempt ${attempt}/${maxAttempts}); retrying…`,
        );
        await this.backoff(attempt);
        continue;
      }

      this.logger.error(`Gemini API error ${response.status}: ${detail}`);
      throw new HttpException(
        response.status === 503
          ? `The model "${model}" is temporarily overloaded. Please retry shortly, or set GEMINI_MODEL to a lighter model (e.g. gemini-3.1-flash-lite).`
          : `Gemini API returned status ${response.status}.`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    // Unreachable, but satisfies the type checker.
    throw new HttpException('Gemini API request failed.', HttpStatus.BAD_GATEWAY);
  }

  private backoff(attempt: number): Promise<void> {
    const delay = GeminiProvider.BASE_DELAY_MS * 2 ** (attempt - 1);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
