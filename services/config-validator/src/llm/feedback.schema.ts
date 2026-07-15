import { z } from 'zod';

/**
 * Structured-output schema handed to LangChain's `withStructuredOutput`. The
 * `.describe()` text is sent to the model as field guidance, and the schema is
 * enforced on the way back — replacing hand-rolled JSON parsing where the
 * provider supports it.
 */
export const feedbackSchema = z.object({
  analysis: z
    .string()
    .describe(
      '1-3 sentences describing the main game-design risk, or that the config looks reasonable',
    ),
  suggested_actions: z
    .array(z.string())
    .describe('concrete fixes; use ["No action needed"] when balanced'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('your confidence in this assessment, 0.0 to 1.0'),
});

export type FeedbackSchema = z.infer<typeof feedbackSchema>;
