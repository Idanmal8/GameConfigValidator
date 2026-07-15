import { Injectable } from '@nestjs/common';
import { LlmFeedback } from '../llm.types';
import { Difficulty } from '../../validation/schema/level-config.schema';

/**
 * Deterministic, offline stand-in for a real LLM. Encodes a few of the same
 * heuristics the prompt describes so e2e tests and offline demos produce
 * meaningful, stable output without an API key, a running Ollama, or network.
 */
@Injectable()
export class MockProvider {
  analyze(config: unknown): LlmFeedback {
    const c = (config ?? {}) as Partial<{
      difficulty: Difficulty;
      reward: number;
      time_limit: number;
    }>;
    const difficulty = c.difficulty;
    const reward = typeof c.reward === 'number' ? c.reward : undefined;
    const time = typeof c.time_limit === 'number' ? c.time_limit : undefined;

    if (difficulty === 'easy' && reward !== undefined && reward > 500) {
      return {
        analysis: `The reward of ${reward} is disproportionately high for an easy level.`,
        suggested_actions: [
          'Reduce reward to 100-500 for easy difficulty',
          'Increase difficulty if you want to keep a high reward',
        ],
        confidence: 0.9,
      };
    }

    if (difficulty === 'hard' && time !== undefined && time < 15) {
      return {
        analysis: `A ${time}-second time limit on a hard level may be too strict and frustrate players.`,
        suggested_actions: [
          'Increase time_limit to 20-30 seconds',
          'Balance reward if keeping a very short time limit',
        ],
        confidence: 0.85,
      };
    }

    return {
      analysis:
        'This configuration looks reasonable for its difficulty and pacing.',
      suggested_actions: ['No action needed'],
      confidence: 0.8,
    };
  }
}
