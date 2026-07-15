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
    // provider), composed as prompt → model.
    try {
      const structured = built.model.withStructuredOutput(feedbackSchema, {
        name: 'level_config_feedback',
      });
      const raw = (await analysisPrompt
        .pipe(structured)
        .invoke(vars)) as Record<string, unknown>;
      return {
        feedback: coerceFeedback(raw),
        provider: provider as LlmProviderName,
        model: built.modelName,
      };
    } catch (structuredErr) {
      // Some local models don't support structured output — fall back to a
      // plain call, ask for JSON explicitly, and defensively parse it.
      this.logger.warn(
        `Structured output failed for ${provider}/${built.modelName}; trying text parse. ${String(
          structuredErr,
        )}`,
      );
      try {
        const messages = await analysisPrompt.formatMessages(vars);
        const res = await built.model.invoke([
          ...messages,
          new HumanMessage(JSON_FORMAT_INSTRUCTION),
        ]);
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
          `LLM call failed for ${provider}/${built.modelName}: ${String(callErr)}`,
        );
        throw new HttpException(
          this.friendlyError(provider, callErr),
          HttpStatus.BAD_GATEWAY,
        );
      }
    }
  }

  private friendlyError(provider: string, err: unknown): string {
    const detail = String((err as Error)?.message ?? err);
    if (provider === 'ollama') {
      return (
        'Could not reach the local Ollama model. Make sure Ollama is running and ' +
        'the model is pulled (docker compose does this on first start, which can ' +
        `take a few minutes). Details: ${detail}`
      );
    }
    return `The ${provider} model is unavailable right now — please retry shortly. Details: ${detail}`;
  }
}
