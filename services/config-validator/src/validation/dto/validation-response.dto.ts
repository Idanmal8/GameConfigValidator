import { ApiProperty } from '@nestjs/swagger';

export class SchemaValidationDto {
  @ApiProperty({ example: true })
  valid!: boolean;

  @ApiProperty({
    type: [String],
    example: [],
    description: 'Human-readable schema errors; empty when valid.',
  })
  errors!: string[];
}

export class LlmFeedbackDto {
  @ApiProperty({
    example:
      'The reward value of 5000 seems disproportionately high for an easy level with a generous 60-second time limit.',
  })
  analysis!: string;

  @ApiProperty({
    type: [String],
    example: [
      'Reduce reward to 100-500 for easy difficulty',
      'Increase difficulty if you wish to keep a high reward',
    ],
  })
  suggested_actions!: string[];

  @ApiProperty({
    example: 0.87,
    description: 'Model-reported confidence in the assessment (0..1).',
  })
  confidence!: number;
}

export class ValidationResponseDto {
  @ApiProperty({ type: SchemaValidationDto })
  schema_validation!: SchemaValidationDto;

  @ApiProperty({
    type: LlmFeedbackDto,
    nullable: true,
    description:
      'LLM analysis. Null when schema validation fails (analysis is skipped).',
  })
  llm_feedback!: LlmFeedbackDto | null;

  @ApiProperty({
    example: 'ollama',
    description: 'Which LLM provider produced the feedback (ollama/gemini/openai/mock).',
  })
  provider!: string;

  @ApiProperty({
    example: 'llama3.2',
    nullable: true,
    description: 'Which model produced the feedback. Null when the LLM was skipped.',
  })
  model!: string | null;
}
