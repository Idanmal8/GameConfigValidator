import { LlmFeedback } from './llm.types';

/**
 * System prompt. Encodes the domain and the *reference* balancing ranges as
 * guidance rather than hard rules, so the model reasons about patterns instead
 * of us hard-coding thresholds.
 */
export const SYSTEM_PROMPT = `You are a game-design balancing assistant for a level-configuration validation tool.

A level configuration has these fields:
- level: the level number (higher = later progression, generally harder).
- difficulty: one of "easy", "medium", "hard".
- reward: in-game currency/points granted for completing the level.
- time_limit: seconds allowed to complete the level (lower = more pressure).

Reference balancing ranges (GUIDELINES, not strict rules — reason about the pattern, do not just check bounds):
- easy:   reward ~100-500,   time_limit >= 30s
- medium: reward ~500-2000,  time_limit ~20-60s
- hard:   reward ~2000-5000, time_limit ~10-30s

Identify logical or game-design risks (e.g. "reward too high for difficulty", "time too short for reward"). Be concise and practical.

Respond with ONLY a JSON object, no markdown, no code fences, matching exactly:
{
  "analysis": string,              // 1-3 sentences describing the main risk, or that the config looks reasonable
  "suggested_actions": string[],   // concrete fixes; use ["No action needed"] when balanced
  "confidence": number             // your confidence in this assessment, 0.0 to 1.0
}`;

export function buildUserPrompt(config: unknown): string {
  return `Analyze this level configuration and return the JSON described above:\n\n${JSON.stringify(
    config,
    null,
    2,
  )}`;
}

/**
 * Defensive parse of an LLM text response into structured feedback. Models
 * occasionally wrap JSON in prose or code fences, so we extract the first JSON
 * object and coerce/clamp fields rather than trusting the payload blindly.
 */
export function parseFeedback(text: string): LlmFeedback {
  return coerceFeedback(extractJson(text));
}

/**
 * Normalises an already-parsed object (from structured output or JSON) into a
 * safe `LlmFeedback`: trims text, filters non-string actions, clamps confidence
 * to [0,1]. Shared by the structured-output and text-fallback paths.
 */
export function coerceFeedback(json: Record<string, unknown>): LlmFeedback {
  const analysis =
    typeof json.analysis === 'string' && json.analysis.trim()
      ? json.analysis.trim()
      : 'The model did not return a usable analysis.';

  const suggested_actions = Array.isArray(json.suggested_actions)
    ? json.suggested_actions
        .filter((a): a is string => typeof a === 'string')
        .map((a) => a.trim())
        .filter(Boolean)
    : [];

  return {
    analysis,
    suggested_actions: suggested_actions.length
      ? suggested_actions
      : ['No specific actions provided.'],
    confidence: clampConfidence(json.confidence),
  };
}

function extractJson(text: string): Record<string, unknown> {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    return {};
  }
}

function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, n));
}
