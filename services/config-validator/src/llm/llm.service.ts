import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage } from '@langchain/core/messages';
import { ModelFactory } from './model.factory';
import { MockProvider } from './providers/mock.provider';
import { feedbackSchema } from './feedback.schema';
import {
  JSON_FORMAT_INSTRUCTION,
  analysisPrompt,
  coerceFeedback,
  configVars,
  parseFeedback,
} from './prompt';
import { LlmAnalyzeOptions, LlmProviderName, LlmResult } from './llm.types';

/**
 * Provider-agnostic LLM facade built on LangChain. Routes to Ollama (local,
 * default), Gemini, or OpenAI — or the deterministic mock — and returns
 * structured, schema-validated feedback.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly factory: ModelFactory,
    private readonly mock: MockProvider,
  ) {}

  // Static catalog of selectable models per provider. `requiresKey` drives the
  // "enabled" vs "needs key" state the UI shows.
  private static readonly CATALOG: Record<
    LlmProviderName,
    { requiresKey: boolean; models: string[] }
  > = {
    ollama: { requiresKey: false, models: ['llama3.2'] },
    gemini: { requiresKey: true, models: ['gemini-3.1-flash-lite', 'gemini-3.5-flash'] },
    openai: { requiresKey: true, models: ['gpt-4o-mini', 'gpt-4o'] },
    mock: { requiresKey: false, models: ['mock'] },
  };

  get defaultProvider(): LlmProviderName {
    return (this.config.get<string>('llm.provider') as LlmProviderName) || 'ollama';
  }

  /** Whether a provider is usable right now (key present for cloud providers). */
  isAvailable(provider: LlmProviderName): boolean {
    if (provider === 'gemini') return !!this.config.get<string>('llm.gemini.apiKey');
    if (provider === 'openai') return !!this.config.get<string>('llm.openai.apiKey');
    return true; // ollama + mock need no key
  }

  /** Provider catalog with live availability, for the UI / API discovery. */
  listProviders(): {
    default: LlmProviderName;
    providers: {
      name: LlmProviderName;
      requiresKey: boolean;
      available: boolean;
      models: string[];
    }[];
  } {
    const names = Object.keys(LlmService.CATALOG) as LlmProviderName[];
    return {
      default: this.defaultProvider,
      providers: names.map((name) => ({
        name,
        requiresKey: LlmService.CATALOG[name].requiresKey,
        available: this.isAvailable(name),
        models: LlmService.CATALOG[name].models,
      })),
    };
  }

  async analyze(
    config: unknown,
    options: LlmAnalyzeOptions = {},
  ): Promise<LlmResult> {
    const provider = (options.provider || this.defaultProvider).toLowerCase();

    if (provider === 'mock') {
      return { feedback: this.mock.analyze(config), provider: 'mock', model: 'mock' };
    }

    const built = this.factory.create(provider, options.model);
    const vars = configVars(config);

    // Preferred path: LangChain structured output (schema enforced by the
    // provider), composed as prompt → model. Bounded by an AbortSignal timeout.
    try {
      const structured = built.model.withStructuredOutput(feedbackSchema, {
        name: 'level_config_feedback',
      });
      const raw = (await analysisPrompt.pipe(structured).invoke(vars, {
        signal: AbortSignal.timeout(built.timeoutMs),
      })) as Record<string, unknown>;
      return {
        feedback: coerceFeedback(raw),
        provider: provider as LlmProviderName,
        model: built.modelName,
      };
    } catch (structuredErr) {
      // Only fall back to the (extra) text call when the model genuinely can't
      // do structured output. Transport/auth/rate-limit/timeout errors must
      // fail fast — retrying them as a second full LLM call just multiplies the
      // wait before the user sees an error.
      if (!isUnsupportedStructuredOutput(structuredErr)) {
        this.logger.error(
          `LLM call failed for ${provider}/${built.modelName}: ${String(structuredErr)}`,
        );
        throw toHttpError(provider, structuredErr);
      }

      this.logger.warn(
        `${provider}/${built.modelName} does not support structured output; using text fallback.`,
      );
      try {
        const messages = await analysisPrompt.formatMessages(vars);
        const res = await built.model.invoke(
          [...messages, new HumanMessage(JSON_FORMAT_INSTRUCTION)],
          { signal: AbortSignal.timeout(built.timeoutMs) },
        );
        const text =
          typeof res.content === 'string'
            ? res.content
            : JSON.stringify(res.content);
        return {
          feedback: parseFeedback(text),
          provider: provider as LlmProviderName,
          model: built.modelName,
        };
      } catch (callErr) {
        this.logger.error(
          `Text fallback failed for ${provider}/${built.modelName}: ${String(callErr)}`,
        );
        throw toHttpError(provider, callErr);
      }
    }
  }
}

/**
 * True only when the error means the model/provider can't do structured output
 * (so a text-mode retry is worthwhile). Everything else — network, auth, rate
 * limit, timeout — returns false and should fail fast.
 */
export function isUnsupportedStructuredOutput(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  return (
    msg.includes('structured output') ||
    msg.includes('withstructuredoutput') ||
    msg.includes('does not support tool') ||
    msg.includes('tools are not supported') ||
    msg.includes('tool calling is not') ||
    msg.includes('function calling is not') ||
    msg.includes('response_format') ||
    msg.includes('json schema') ||
    msg.includes('json_schema')
  );
}

/** Map a provider error to an HttpException with an accurate status + message. */
export function toHttpError(provider: string, err: unknown): HttpException {
  const raw = String((err as Error)?.message ?? err);
  const msg = raw.toLowerCase();
  const name = (err as { name?: string })?.name ?? '';

  if (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    msg.includes('aborted') ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  ) {
    return new HttpException(
      `The ${provider} model did not respond in time (timed out).` +
        (provider === 'ollama'
          ? ' A local model may still be loading — try again shortly.'
          : ' Please try again.'),
      HttpStatus.GATEWAY_TIMEOUT,
    );
  }

  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
    return new HttpException(
      `The ${provider} model is rate-limited right now. Please retry shortly.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  if (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthorized') ||
    msg.includes('permission denied') ||
    msg.includes('api key') ||
    msg.includes('api_key')
  ) {
    return new HttpException(
      `The ${provider} credentials were rejected. Check the API key configured on the server.`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  if (
    provider === 'ollama' &&
    (msg.includes('econnrefused') ||
      msg.includes('fetch failed') ||
      msg.includes('connect') ||
      msg.includes('network'))
  ) {
    return new HttpException(
      'Could not reach the local Ollama model. Ensure Ollama is running and the model ' +
        `is pulled (docker compose does this on first start). Details: ${raw}`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  return new HttpException(
    `The ${provider} model is unavailable right now — please retry shortly. Details: ${raw}`,
    HttpStatus.BAD_GATEWAY,
  );
}
