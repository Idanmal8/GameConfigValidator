import { SchemaValidationService } from './schema-validation.service';

describe('SchemaValidationService', () => {
  const service = new SchemaValidationService();

  it('accepts a well-formed config', () => {
    const result = service.validateConfig({
      level: 12,
      time_limit: 60,
      reward: 5000,
      difficulty: 'easy',
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rejects an unknown difficulty', () => {
    const result = service.validateConfig({
      level: 1,
      time_limit: 30,
      reward: 100,
      difficulty: 'impossible',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/difficulty/);
  });

  it('rejects missing required fields', () => {
    const result = service.validateConfig({ level: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-integer level and reports the field', () => {
    const result = service.validateConfig({
      level: 1.5,
      time_limit: 30,
      reward: 100,
      difficulty: 'easy',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/level/);
  });

  it('rejects unknown extra properties', () => {
    const result = service.validateConfig({
      level: 1,
      time_limit: 30,
      reward: 100,
      difficulty: 'easy',
      unexpected: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/unexpected/);
  });
});
