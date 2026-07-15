import { analysisPrompt, parseFeedback } from './prompt';

describe('parseFeedback', () => {
  it('parses a clean JSON response', () => {
    const fb = parseFeedback(
      '{"analysis":"ok","suggested_actions":["a","b"],"confidence":0.9}',
    );
    expect(fb.analysis).toBe('ok');
    expect(fb.suggested_actions).toEqual(['a', 'b']);
    expect(fb.confidence).toBe(0.9);
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const fb = parseFeedback(
      '```json\n{"analysis":"fenced","suggested_actions":["x"],"confidence":0.5}\n```',
    );
    expect(fb.analysis).toBe('fenced');
    expect(fb.suggested_actions).toEqual(['x']);
  });

  it('extracts JSON embedded in surrounding prose', () => {
    const fb = parseFeedback(
      'Sure! Here you go: {"analysis":"embedded","suggested_actions":[],"confidence":1} hope that helps',
    );
    expect(fb.analysis).toBe('embedded');
  });

  it('clamps out-of-range confidence into [0,1]', () => {
    expect(parseFeedback('{"analysis":"a","confidence":5}').confidence).toBe(1);
    expect(parseFeedback('{"analysis":"a","confidence":-2}').confidence).toBe(0);
  });

  it('falls back gracefully on unparseable text', () => {
    const fb = parseFeedback('the model rambled and returned no json');
    expect(typeof fb.analysis).toBe('string');
    expect(Array.isArray(fb.suggested_actions)).toBe(true);
    expect(fb.confidence).toBe(0.5);
  });
});

describe('analysisPrompt', () => {
  it('embeds the config into the human message and keeps the system prompt', async () => {
    const messages = await analysisPrompt.formatMessages({
      config: '{"level":1}',
    });
    const system = String(messages[0].content);
    const human = String(messages[messages.length - 1].content);

    expect(system).toMatch(/game-design balancing assistant/i);
    // output-format instructions must NOT be in the shared prompt anymore
    expect(system).not.toMatch(/JSON object/i);
    expect(human).toContain('"level":1');
  });
});
