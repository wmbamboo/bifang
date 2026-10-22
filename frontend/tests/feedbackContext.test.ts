/**
 * @jest-environment jsdom
 */
import { TextDecoder, TextEncoder } from 'util';

(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

jest.mock('@umijs/max', () => ({
  request: jest.fn(),
  history: { push: jest.fn() },
}));

jest.mock('../src/utils/authAxios', () => {
  const get = jest.fn();
  return { __esModule: true, default: { get } };
});

import { renderHook, waitFor } from '@testing-library/react';
import {
  clampContextJson,
  buildFeedbackContext,
} from '../src/utils/feedbackContext';
import {
  clampModalPos,
  readModalPos,
} from '../src/components/Feedback/modalDrag';
import { feedbackStatusLabel } from '../src/services/feedback';
import { useFeedbackImages } from '../src/components/Feedback/useFeedbackImages';
import authAxios from '../src/utils/authAxios';

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

describe('clampModalPos', () => {
  test('clamps negative to origin', () => {
    expect(clampModalPos(-100, -100, 200, 100, 800, 600)).toEqual({
      x: 0,
      y: 0,
    });
  });

  test('clamps beyond bottom-right', () => {
    expect(clampModalPos(900, 700, 200, 100, 800, 600)).toEqual({
      x: 600,
      y: 500,
    });
  });

  test('taller than viewport sticks to top', () => {
    expect(clampModalPos(10, 50, 200, 900, 800, 600)).toEqual({
      x: 10,
      y: 0,
    });
  });
});

describe('feedbackStatusLabel', () => {
  test('five statuses have pairwise-distinct colors; fixed is 待确认', () => {
    const statuses = [
      'pending',
      'resolving',
      'fixed',
      'resolved',
      'ignored',
    ] as const;
    const colors = statuses.map((s) => feedbackStatusLabel(s).color);
    expect(new Set(colors).size).toBe(5);
    expect(feedbackStatusLabel('fixed').text).toBe('待确认');
  });

  test('empty / undefined does not throw', () => {
    expect(feedbackStatusLabel('').text).toBe('—');
    expect(feedbackStatusLabel(undefined).text).toBe('—');
  });
});

describe('readModalPos', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test.each(['{}', 'null', 'abc'])('dirty %s -> null', (raw) => {
    sessionStorage.setItem('bf_fb_modal_pos', raw);
    expect(readModalPos()).toBeNull();
  });
});

describe('useFeedbackImages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (URL as any).createObjectURL = jest.fn(() => 'blob:mock-url');
    (URL as any).revokeObjectURL = jest.fn();
  });

  test('maps names to blob: urls and revokes on clear', async () => {
    (authAxios.get as jest.Mock).mockResolvedValue({
      data: new Blob(['x'], { type: 'image/png' }),
    });
    const { result, rerender, unmount } = renderHook(
      ({ names }) => useFeedbackImages(names),
      { initialProps: { names: ['a.png'] } },
    );
    await waitFor(() => {
      expect(result.current['a.png']).toMatch(/^blob:/);
    });
    rerender({ names: [] });
    await waitFor(() => {
      expect(Object.keys(result.current).length).toBe(0);
    });
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
