export type Difficulty = 'easy' | 'medium' | 'hard';

/** The canonical shape of a validated game level configuration. */
export interface LevelConfig {
  level: number;
  difficulty: Difficulty;
  reward: number;
  time_limit: number;
}

/**
 * JSON Schema used by ajv. Kept as the single source of truth for the config
 * contract — it is portable (other services/languages can consume it) and its
 * `{ valid, errors }` output maps directly onto our API response.
 */
export const levelConfigSchema = {
  $id: 'level-config',
  type: 'object',
  additionalProperties: false,
  required: ['level', 'difficulty', 'reward', 'time_limit'],
  properties: {
    level: { type: 'integer', minimum: 1 },
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
    reward: { type: 'integer', minimum: 0 },
    time_limit: { type: 'integer', minimum: 1 },
  },
} as const;
