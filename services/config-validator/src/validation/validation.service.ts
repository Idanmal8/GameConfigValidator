import { Injectable } from '@nestjs/common';
import JSON5 from 'json5';
import { SchemaValidationService } from './schema/schema-validation.service';
import { LlmService } from '../llm/llm.service';
import { LlmAnalyzeOptions } from '../llm/llm.types';
import { ValidationResponseDto } from './dto/validation-response.dto';

@Injectable()
export class ValidationService {
  constructor(
    private readonly schema: SchemaValidationService,
    private readonly llm: LlmService,
  ) {}

  async validate(
    input: unknown,
    options: LlmAnalyzeOptions = {},
  ): Promise<ValidationResponseDto> {
    const parsed = this.parseBody(input);

    // Malformed or empty JSON never reaches the schema — surface it as a
    // structured validation failure instead of a raw parser error.
    if (!parsed.ok) {
      return {
        schema_validation: { valid: false, errors: [parsed.error] },
        llm_feedback: null,
        provider: options.provider ?? this.llm.defaultProvider,
        model: null,
      };
    }

    const schema_validation = this.schema.validateConfig(parsed.value);

    // Don't spend an LLM call analysing a structurally invalid config —
    // the feedback would be meaningless. Surface the schema errors instead.
    if (!schema_validation.valid) {
      return {
        schema_validation,
        llm_feedback: null,
        provider: options.provider ?? this.llm.defaultProvider,
        model: null,
      };
    }

    const result = await this.llm.analyze(parsed.value, options);
    return {
      schema_validation,
      llm_feedback: result.feedback,
      provider: result.provider,
      model: result.model,
    };
  }

  /**
   * The request body arrives as raw text (see main.ts). Parse it here so a
   * syntax error becomes a structured validation result rather than a 400 from
   * the body parser. Objects are passed through untouched (used by unit tests).
   */
  private parseBody(
    input: unknown,
  ): { ok: true; value: unknown } | { ok: false; error: string } {
    if (input !== null && typeof input === 'object') {
      return { ok: true, value: input };
    }
    if (typeof input !== 'string' || input.trim() === '') {
      return { ok: false, error: 'Request body is empty; expected a JSON object.' };
    }
    try {
      return { ok: true, value: JSON.parse(input) };
    } catch (strictErr) {
      // Tolerate common hand-editing slips (trailing commas, comments, etc.) so
      // the config still reaches schema validation and produces a meaningful
      // field-level error rather than a cryptic syntax error.
      try {
        return { ok: true, value: JSON5.parse(input) };
      } catch {
        return { ok: false, error: friendlyJsonError(input, strictErr as Error) };
      }
    }
  }
}

/**
 * Turns a raw JSON parser error into a plain-language, line-located message a
 * config author (not just a programmer) can act on.
 */
function friendlyJsonError(input: string, err: Error): string {
  const hint =
    'Common causes: a trailing comma before "}" or "]", a missing comma ' +
    'between fields, a missing value, or an unquoted property name.';

  const loc = locateJsonError(input, err.message);
  if (!loc) {
    return `Invalid JSON. ${hint}`;
  }

  const problemLine = (input.split('\n')[loc.line - 1] ?? '').trim();
  return (
    `Invalid JSON at line ${loc.line}, column ${loc.column}. ${hint}` +
    (problemLine ? ` Check this line: "${problemLine}"` : '')
  );
}

/** Extract a line/column from a V8 JSON error message (varies by Node version). */
function locateJsonError(
  input: string,
  message: string,
): { line: number; column: number } | null {
  const lineCol = /line (\d+) column (\d+)/.exec(message);
  if (lineCol) {
    return { line: Number(lineCol[1]), column: Number(lineCol[2]) };
  }
  const pos = /position (\d+)/.exec(message);
  if (pos) {
    const before = input.slice(0, Number(pos[1])).split('\n');
    return {
      line: before.length,
      column: (before[before.length - 1]?.length ?? 0) + 1,
    };
  }
  return null;
}
