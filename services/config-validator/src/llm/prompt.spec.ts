import { buildUserPrompt, parseFeedback } from './prompt';

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

describe('buildUserPrompt', () => {
  it('embeds the config as pretty JSON', () => {
    const prompt = buildUserPrompt({ level: 1 });
    expect(prompt).toContain('"level": 1');
  });
});
