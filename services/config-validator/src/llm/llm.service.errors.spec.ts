import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RunnableLambda } from '@langchain/core/runnables';
import {
  LlmService,
  isUnsupportedStructuredOutput,
  toHttpError,
} from './llm.service';
import { BuiltModel, ModelFactory } from './model.factory';
import { MockProvider } from './providers/mock.provider';

const timeoutError = () => {
  const e = new Error('The operation timed out');
  e.name = 'TimeoutError';
  return e;
};

describe('error classification', () => {
  it('recognises "unsupported structured output" errors', () => {
    expect(
      isUnsupportedStructuredOutput(new Error('This model does not support tools')),
    ).toBe(true);
    expect(
      isUnsupportedStructuredOutput(new Error('response_format is not supported')),
    ).toBe(true);
  });

  it('treats transport / auth / timeout as NOT unsupported (fail fast)', () => {
    expect(
      isUnsupportedStructuredOutput(new Error('connect ECONNREFUSED 127.0.0.1:11434')),
    ).toBe(false);
    expect(isUnsupportedStructuredOutput(new Error('401 Unauthorized'))).toBe(false);
    expect(isUnsupportedStructuredOutput(timeoutError())).toBe(false);
  });

  it('maps errors to accurate HTTP statuses', () => {
    expect(toHttpError('ollama', timeoutError()).getStatus()).toBe(
      HttpStatus.GATEWAY_TIMEOUT,
    );
    expect(toHttpError('gemini', new Error('429 rate limit')).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect(toHttpError('openai', new Error('401 invalid api key')).getStatus()).toBe(
      HttpStatus.BAD_GATEWAY,
    );
    expect(
      toHttpError('ollama', new Error('connect ECONNREFUSED')).getStatus(),
    ).toBe(HttpStatus.BAD_GATEWAY);
  });
});

function buildService(over: {
  structuredError?: unknown;
  structuredResult?: Record<string, unknown>;
  textContent?: string;
}): { service: LlmService; textInvoke: jest.Mock } {
  const textInvoke = jest.fn(async () => ({
    content:
      over.textContent ??
      '{"analysis":"from text","suggested_actions":["a"],"confidence":0.5}',
  }));

  const fakeModel = {
    withStructuredOutput: () =>
      RunnableLambda.from(async () => {
        if (over.structuredError) throw over.structuredError;
        return (
          over.structuredResult ?? {
            analysis: 'structured',
            suggested_actions: ['a'],
            confidence: 0.9,
          }
        );
      }),
    invoke: textInvoke,
  };

  const factory = {
    create: (): BuiltModel =>
      ({
        model: fakeModel,
        provider: 'ollama',
        modelName: 'llama3.2',
        timeoutMs: 5000,
      }) as unknown as BuiltModel,
  } as unknown as ModelFactory;

  const config = {
    get: (k: string) => (k === 'llm.provider' ? 'ollama' : undefined),
  } as unknown as ConfigService;

  return {
    service: new LlmService(config, factory, new MockProvider()),
    textInvoke,
  };
}

describe('LlmService.analyze error handling', () => {
  const cfg = { level: 1, time_limit: 30, reward: 100, difficulty: 'easy' };

  it('returns structured feedback on the happy path (no text call)', async () => {
    const { service, textInvoke } = buildService({
      structuredResult: { analysis: 'ok', suggested_actions: ['x'], confidence: 0.8 },
    });
    const res = await service.analyze(cfg, { provider: 'ollama' });
    expect(res.feedback.analysis).toBe('ok');
    expect(res.provider).toBe('ollama');
    expect(textInvoke).not.toHaveBeenCalled();
  });

  it('falls back to the text path ONLY for unsupported structured output', async () => {
    const { service, textInvoke } = buildService({
      structuredError: new Error('This model does not support tools'),
    });
    const res = await service.analyze(cfg, { provider: 'ollama' });
    expect(res.feedback.analysis).toBe('from text');
    expect(textInvoke).toHaveBeenCalledTimes(1); // exactly one fallback call
  });

  it('fails fast on a transport error — no second LLM call', async () => {
    const { service, textInvoke } = buildService({
      structuredError: new Error('connect ECONNREFUSED 127.0.0.1:11434'),
    });
    await expect(service.analyze(cfg, { provider: 'ollama' })).rejects.toBeDefined();
    expect(textInvoke).not.toHaveBeenCalled();
  });

  it('returns 504 and fails fast on a timeout', async () => {
    const { service, textInvoke } = buildService({ structuredError: timeoutError() });
    let status: number | undefined;
    try {
      await service.analyze(cfg, { provider: 'ollama' });
    } catch (e) {
      status = (e as { getStatus?: () => number }).getStatus?.();
    }
    expect(status).toBe(HttpStatus.GATEWAY_TIMEOUT);
    expect(textInvoke).not.toHaveBeenCalled();
  });
});
