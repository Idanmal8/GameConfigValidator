import { ConfigService } from '@nestjs/config';
import { ModelFactory } from './model.factory';

function factoryWith(values: Record<string, unknown>): ModelFactory {
  const config = {
    get: <T>(key: string): T => values[key] as T,
  } as unknown as ConfigService;
  return new ModelFactory(config);
}

describe('ModelFactory', () => {
  it('builds an Ollama model without any key', () => {
    const factory = factoryWith({
      'llm.ollama.baseUrl': 'http://localhost:11434',
      'llm.ollama.model': 'llama3.2',
    });
    const built = factory.create('ollama');
    expect(built.provider).toBe('ollama');
    expect(built.modelName).toBe('llama3.2');
    expect(built.model).toBeDefined();
  });

  it('carries a request timeout (falls back to the default when unset)', () => {
    const factory = factoryWith({ 'llm.ollama.baseUrl': 'http://localhost:11434' });
    expect(factory.create('ollama').timeoutMs).toBe(60_000);

    const withOverride = factoryWith({
      'llm.ollama.baseUrl': 'http://localhost:11434',
      'llm.timeoutMs': 15_000,
    });
    expect(withOverride.create('ollama').timeoutMs).toBe(15_000);
  });

  it('throws a clear error when a cloud provider has no key', () => {
    const factory = factoryWith({ 'llm.gemini.apiKey': '' });
    expect(() => factory.create('gemini')).toThrow(/GEMINI_API_KEY/);
  });

  it('honours a per-request model override', () => {
    const factory = factoryWith({
      'llm.gemini.apiKey': 'test-key',
      'llm.gemini.model': 'gemini-3.1-flash-lite',
    });
    const built = factory.create('gemini', 'gemini-3.5-flash');
    expect(built.modelName).toBe('gemini-3.5-flash');
  });

  it('rejects an unknown provider', () => {
    const factory = factoryWith({});
    expect(() => factory.create('bogus')).toThrow(/Unknown provider/);
  });
});
