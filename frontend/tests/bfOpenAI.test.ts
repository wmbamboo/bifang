/**
 * @jest-environment node
 */
import 'openai/shims/node';

const store: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => {
    store[k] = String(v);
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    Object.keys(store).forEach((k) => delete store[k]);
  },
};

import { bfAuthFetch, bfOpenAI } from '../src/utils/bfOpenAI';

const okCompletion = () =>
  new Response(
    JSON.stringify({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1,
      model: 'x',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'ok' },
          finish_reason: 'stop',
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

describe('bfAuthFetch', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest
      .fn()
      .mockImplementation(() => Promise.resolve(okCompletion())) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('injects token and Authorization from localStorage', async () => {
    localStorage.setItem('token', 'T1');
    await bfAuthFetch('http://x/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(global.fetch).toHaveBeenCalled();
    const init = (global.fetch as jest.Mock).mock.calls[0][1];
    const h = new Headers(init.headers);
    expect(h.get('token')).toBe('T1');
    expect(h.get('Authorization')).toBe('Bearer T1');
  });
});

describe('bfOpenAI', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest
      .fn()
      .mockImplementation(() => Promise.resolve(okCompletion())) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('SDK create sends current session token via custom fetch', async () => {
    localStorage.setItem('token', 'T1');
    const client = bfOpenAI('http://example.test/chat');
    await client.chat.completions.create({
      model: 'x',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(global.fetch).toHaveBeenCalled();
    const init = (global.fetch as jest.Mock).mock.calls[0][1];
    const h = new Headers(init.headers);
    expect(h.get('token')).toBe('T1');
    expect(h.get('Authorization')).toBe('Bearer T1');
  });

  test('token change without rebuilding client uses new token', async () => {
    const client = bfOpenAI('http://example.test/chat');
    localStorage.setItem('token', 'T1');
    await client.chat.completions.create({
      model: 'x',
      messages: [{ role: 'user', content: 'a' }],
    });
    localStorage.setItem('token', 'T2');
    await client.chat.completions.create({
      model: 'x',
      messages: [{ role: 'user', content: 'b' }],
    });
    const second = (global.fetch as jest.Mock).mock.calls[1][1];
    const h = new Headers(second.headers);
    expect(h.get('token')).toBe('T2');
    expect(h.get('Authorization')).toBe('Bearer T2');
  });
});
