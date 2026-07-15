import { Test } from '@nestjs/testing';
import { ValidationService } from './validation.service';
import { SchemaValidationService } from './schema/schema-validation.service';
import { LlmService } from '../llm/llm.service';
import { LLM_PROVIDER } from '../llm/llm.provider.interface';
import { MockProvider } from '../llm/providers/mock.provider';

describe('ValidationService', () => {
  let service: ValidationService;
  let analyzeSpy: jest.SpyInstance;

  beforeEach(async () => {
    const provider = new MockProvider();
    analyzeSpy = jest.spyOn(provider, 'analyze');

    const moduleRef = await Test.createTestingModule({
      providers: [
        ValidationService,
        SchemaValidationService,
        LlmService,
        { provide: LLM_PROVIDER, useValue: provider },
      ],
    }).compile();

    service = moduleRef.get(ValidationService);
  });

  it('returns schema results and LLM feedback for a valid config', async () => {
    const result = await service.validate({
      level: 12,
      time_limit: 60,
      reward: 5000,
      difficulty: 'easy',
    });

    expect(result.schema_validation.valid).toBe(true);
    expect(result.llm_feedback).not.toBeNull();
    expect(result.llm_feedback?.analysis).toMatch(/reward/i);
    expect(result.provider).toBe('mock');
  });

  it('skips the LLM call when the schema is invalid', async () => {
    const result = await service.validate({ level: 1 });

    expect(result.schema_validation.valid).toBe(false);
    expect(result.llm_feedback).toBeNull();
    expect(analyzeSpy).not.toHaveBeenCalled();
  });

  it('tolerates a trailing comma and reports the missing field (no LLM call)', async () => {
    // deleting `difficulty` usually leaves a trailing comma — still readable
    const result = await service.validate(
      '{"level":12,"time_limit":60,"reward":5000,}',
    );

    expect(result.schema_validation.valid).toBe(false);
    expect(result.schema_validation.errors.join(' ')).toMatch(
      /difficulty: is required/,
    );
    expect(result.schema_validation.errors.join(' ')).not.toMatch(
      /position|column/i,
    );
    expect(result.llm_feedback).toBeNull();
    expect(analyzeSpy).not.toHaveBeenCalled();
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
    expect(result.llm_feedback).toBeNull();
  });

  it('returns a structured error for an empty body', async () => {
    const result = await service.validate('');
    expect(result.schema_validation.valid).toBe(false);
    expect(result.schema_validation.errors[0]).toMatch(/empty/i);
  });

  it('reports every missing required field for valid-but-incomplete JSON', async () => {
    const result = await service.validate('{"level":12,"reward":5000}');
    expect(result.schema_validation.valid).toBe(false);
    const joined = result.schema_validation.errors.join(' ');
    expect(joined).toMatch(/difficulty: is required/);
    expect(joined).toMatch(/time_limit: is required/);
    expect(result.llm_feedback).toBeNull();
  });

  it('forwards the model override to the provider', async () => {
    await service.validate(
      { level: 1, time_limit: 30, reward: 100, difficulty: 'easy' },
      'gemini-3.1-flash-lite',
    );
    expect(analyzeSpy).toHaveBeenCalledWith(expect.anything(), {
      model: 'gemini-3.1-flash-lite',
    });
  });
});
