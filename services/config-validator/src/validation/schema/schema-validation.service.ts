import { Injectable } from '@nestjs/common';
import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { levelConfigSchema } from './level-config.schema';

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable()
export class SchemaValidationService {
  private readonly validate: ValidateFunction;

  constructor() {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    this.validate = ajv.compile(levelConfigSchema);
  }

  validateConfig(input: unknown): SchemaValidationResult {
    const valid = this.validate(input) as boolean;
    if (valid) {
      return { valid: true, errors: [] };
    }
    return {
      valid: false,
      errors: (this.validate.errors ?? []).map(formatError),
    };
  }
}

function formatError(err: ErrorObject): string {
  const params = err.params as {
    additionalProperty?: string;
    missingProperty?: string;
  };

  if (err.keyword === 'required' && params.missingProperty) {
    return `${params.missingProperty}: is required`;
  }
  if (err.keyword === 'additionalProperties' && params.additionalProperty) {
    return `${params.additionalProperty}: is not an allowed property`;
  }

  const field = err.instancePath
    ? err.instancePath.replace(/^\//, '')
    : '(root)';
  return `${field}: ${err.message}`;
}
