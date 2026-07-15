import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';

// Concrete chat models parameterise BaseChatModel with provider-specific call
// options, which don't unify with the default generics. `any` on the generics
// lets them share one field while we only use the common .withStructuredOutput
// / .invoke surface.
type AnyChatModel = BaseChatModel<any, any>;

export interface BuiltModel {
  model: AnyChatModel;
  provider: string;
  modelName: string;
  /** Per-request timeout (ms); the service also enforces it via AbortSignal. */
  timeoutMs: number;
}

const TEMPERATURE = 0.4;
const MAX_RETRIES = 2; // LangChain retries transient 429/5xx (e.g. Gemini overload)
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Builds a LangChain chat model for the requested provider. This is the single
 * seam where providers plug in — adding Anthropic, Mistral, etc. is one case.
 */
@Injectable()
export class ModelFactory {
  constructor(private readonly config: ConfigService) {}

  create(provider: string, model?: string): BuiltModel {
    const timeoutMs =
      this.config.get<number>('llm.timeoutMs') ?? DEFAULT_TIMEOUT_MS;
    let raw: unknown;
    let modelName: string;

    switch (provider) {
      case 'gemini': {
        const apiKey = this.requireKey('llm.gemini.apiKey', 'gemini', 'GEMINI_API_KEY');
        modelName = model || this.config.get<string>('llm.gemini.model')!;
        raw = new ChatGoogleGenerativeAI({
          apiKey,
          model: modelName,
          temperature: TEMPERATURE,
          maxRetries: MAX_RETRIES,
        });
        break;
      }
      case 'openai': {
        const apiKey = this.requireKey('llm.openai.apiKey', 'openai', 'OPENAI_API_KEY');
        modelName = model || this.config.get<string>('llm.openai.model')!;
        raw = new ChatOpenAI({
          apiKey,
          model: modelName,
          temperature: TEMPERATURE,
          maxRetries: MAX_RETRIES,
          timeout: timeoutMs,
        });
        break;
      }
      case 'ollama': {
        const baseUrl = this.config.get<string>('llm.ollama.baseUrl')!;
        modelName = model || this.config.get<string>('llm.ollama.model')!;
        raw = new ChatOllama({
          baseUrl,
          model: modelName,
          temperature: TEMPERATURE,
          maxRetries: MAX_RETRIES,
        });
        break;
      }
      default:
        throw new HttpException(
          `Unknown provider "${provider}". Use one of: ollama, gemini, openai, mock.`,
          HttpStatus.BAD_REQUEST,
        );
    }

    return { provider, modelName, model: raw as AnyChatModel, timeoutMs };
  }

  private requireKey(path: string, provider: string, env: string): string {
    const key = this.config.get<string>(path);
    if (!key) {
      throw new HttpException(
        `Provider "${provider}" is not configured on this server. Set ${env} to enable it, ` +
          'or use the default "ollama" provider (no key required).',
        HttpStatus.BAD_REQUEST,
      );
    }
    return key;
  }
}
