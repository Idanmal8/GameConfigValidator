import { ApiProperty } from '@nestjs/swagger';

/**
 * Documentation-only DTO for Swagger. Runtime validation is performed by ajv
 * against the JSON Schema, which lets us *return* errors as data instead of
 * rejecting the request with a 400.
 */
export class LevelConfigDto {
  @ApiProperty({ example: 12, description: 'Level number (>= 1).' })
  level!: number;

  @ApiProperty({
    example: 'easy',
    enum: ['easy', 'medium', 'hard'],
    description: 'Level difficulty.',
  })
  difficulty!: string;

  @ApiProperty({ example: 5000, description: 'Reward granted on completion.' })
  reward!: number;

  @ApiProperty({ example: 60, description: 'Seconds allowed to complete.' })
  time_limit!: number;
}
