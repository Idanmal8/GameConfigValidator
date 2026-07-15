import { Test } from '@nestjs/testing';
import { ValidationService } from './validation.service';
import { SchemaValidationService } from './schema/schema-validation.service';
import { LlmService } from '../llm/llm.service';

describe('ValidationService', () => {
  let service: ValidationService;
  let analyze: jest.Mock;

  beforeEach(async () => {
    analyze = jest.fn().mockResolvedValue({
      feedback: {
        analysis: 'The reward is high for an easy level.',
        suggested_actions: ['Reduce reward'],
        confidence: 0.9,
      },
      provider: 'mock',
      model: 'mock',
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ValidationService,
        SchemaValidationService,
        { provide: LlmService, useValue: { analyze, defaultProvider: 'ollama' } },
      ],
    }).compile();

    service = moduleRef.get(ValidationService);
  });

  it('returns schema results, LLM feedback, provider and model for a valid config', async () => {
    const result = await service.validate({
      level: 12,
      time_limit: 60,
      reward: 5000,
      difficulty: 'easy',
    });

    expect(result.schema_validation.valid).toBe(true);
    expect(result.llm_feedback).not.toBeNull();
    expect(result.provider).toBe('mock');
    expect(result.model).toBe('mock');
    expect(analyze).toHaveBeenCalled();
  });

  it('skips the LLM call when the schema is invalid', async () => {
    const result = await service.validate({ level: 1 });

    expect(result.schema_validation.valid).toBe(false);
    expect(result.llm_feedback).toBeNull();
    expect(result.provider).toBe('ollama'); // default, since no request override
    expect(result.model).toBeNull();
    expect(analyze).not.toHaveBeenCalled();
  });

  it('tolerates a trailing comma and reports the missing field (no LLM call)', async () => {
    const result = await service.validate(
      '{"level":12,"time_limit":60,"reward":5000,}',
    );

    expect(result.schema_validation.valid).toBe(false);
    expect(result.schema_validation.errors.join(' ')).toMatch(
      /difficulty: is required/,
    );
    expect(analyze).not.toHaveBeenCalled();
  });

  it('accepts an otherwise-valid config that has a trailing comma', async () => {
    const result = await service.validate(
      '{"level":1,"time_limit":30,"reward":100,"difficulty":"easy",}',
    );
    expect(result.schema_validation.valid).toBe(true);
    expect(result.llm_feedback).not.toBeNull();
  });

  it('returns a friendly, line-located error for genuinely broken JSON', async () => {
    const result = await service.validate(
      '{\n  "level": 12,\n  "time_limit":\n}',
    );
    expect(result.schema_validation.valid).toBe(false);
    expect(result.schema_validation.errors[0]).toMatch(/Invalid JSON/i);
    expect(result.schema_validation.errors[0]).toMatch(/Common causes/i);
  });

  it('returns a structured error for an empty body', async () => {
    const result = await service.validate('');
    expect(result.schema_validation.valid).toBe(false);
    expect(result.schema_validation.errors[0]).toMatch(/empty/i);
  });

  it('forwards provider and model options to the LLM service', async () => {
    await service.validate(
      { level: 1, time_limit: 30, reward: 100, difficulty: 'easy' },
      { provider: 'gemini', model: 'gemini-3.1-flash-lite' },
    );
    expect(analyze).toHaveBeenCalledWith(expect.anything(), {
      provider: 'gemini',
      model: 'gemini-3.1-flash-lite',
    });
  });
});
