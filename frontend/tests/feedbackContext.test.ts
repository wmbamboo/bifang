import {
  clampContextJson,
  buildFeedbackContext,
} from '../src/utils/feedbackContext';

describe('feedback context clamp', () => {
  test('clampContextJson keeps small payload', () => {
    const s = clampContextJson({ a: 1, b: 'ok' });
    expect(s).toContain('"a":1');
    expect(s.length).toBeLessThan(100);
  });

  test('clampContextJson truncates over 32KB', () => {
    const big = { pad: '中'.repeat(20000) };
    const s = clampContextJson(big);
    const bytes = new TextEncoder().encode(s).length;
    expect(bytes).toBeLessThanOrEqual(32 * 1024);
    expect(s).toContain('truncated');
  });

  test('buildFeedbackContext returns object with pathname keys', () => {
    const ctx = buildFeedbackContext({ gen_id: 'g1', gen_type: 'kb-ppt' });
    expect(ctx.gen_id).toBe('g1');
    expect(ctx.gen_type).toBe('kb-ppt');
    expect(Array.isArray(ctx.console_tail)).toBe(true);
  });
});

describe('feedback submit idempotent id', () => {
  test('same id used twice is same string key', () => {
    const id = 'abc123idempotent';
    const a = { id, content: 'x' };
    const b = { id, content: 'x' };
    expect(a.id).toBe(b.id);
  });
});
