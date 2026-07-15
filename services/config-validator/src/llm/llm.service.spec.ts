import { ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service';
import { ModelFactory } from './model.factory';
import { MockProvider } from './providers/mock.provider';

function serviceWith(values: Record<string, unknown>): LlmService {
  const config = {
    get: <T>(key: string): T => values[key] as T,
  } as unknown as ConfigService;
  return new LlmService(config, {} as ModelFactory, {} as MockProvider);
}

describe('LlmService.listProviders', () => {
  it('marks a cloud provider available only when its key is set', () => {
    const service = serviceWith({
      'llm.provider': 'ollama',
      'llm.gemini.apiKey': 'a-key',
      'llm.openai.apiKey': '',
    });

    const byName = Object.fromEntries(
      service.listProviders().providers.map((p) => [p.name, p]),
    );

    expect(byName.gemini.available).toBe(true);
    expect(byName.gemini.requiresKey).toBe(true);
    expect(byName.openai.available).toBe(false);
    expect(byName.ollama.available).toBe(true); // keyless
    expect(byName.mock.available).toBe(true);
  });

  it('reports the configured default provider', () => {
    expect(serviceWith({ 'llm.provider': 'gemini' }).listProviders().default).toBe(
      'gemini',
    );
    expect(serviceWith({}).listProviders().default).toBe('ollama');
  });
});
