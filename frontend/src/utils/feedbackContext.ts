/**
 * 反馈上下文快照：console_tail ≤50 条、单条 ≤500 字；整体 ≤32KB。
 */

const MAX_TAIL = 50;
const MAX_LINE = 500;
const MAX_JSON_BYTES = 32 * 1024;

type ConsoleLine = { level: string; text: string; t: number };

let _tail: ConsoleLine[] = [];
let _patched = false;

export function ensureConsoleTailCapture() {
  if (_patched || typeof window === 'undefined') return;
  _patched = true;
  const wrap = (level: 'log' | 'warn' | 'error') => {
    const orig = console[level].bind(console);
    console[level] = (...args: any[]) => {
      try {
        const text = args
          .map((a) => {
            if (typeof a === 'string') return a;
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          })
          .join(' ')
          .slice(0, MAX_LINE);
        if (level === 'warn' || level === 'error') {
          _tail.push({ level, text, t: Date.now() });
          if (_tail.length > MAX_TAIL) _tail = _tail.slice(-MAX_TAIL);
        }
      } catch {
        /* ignore */
      }
      orig(...args);
    };
  };
  wrap('warn');
  wrap('error');
}

export function getConsoleTail(): ConsoleLine[] {
  return _tail.slice(-MAX_TAIL);
}

export type FeedbackContextInput = {
  gen_id?: string;
  gen_type?: string;
  outline_id?: string;
  target_key?: string;
  prompt_hash?: string;
  model?: string;
  temperature?: number;
  asset_ref?: string;
  allowed_refs?: string[];
  doc_file?: string;
  mtime?: number;
  extra?: Record<string, any>;
};

/** 构建并截断到 ≤32KB 的 context 对象（返回对象，序列化长度受控） */
export function buildFeedbackContext(
  input: FeedbackContextInput = {},
): Record<string, any> {
  ensureConsoleTailCapture();
  const ctx: Record<string, any> = {
    gen_id: input.gen_id || '',
    gen_type: input.gen_type || '',
    outline_id: input.outline_id || '',
    target_key: input.target_key || '',
    prompt_hash: input.prompt_hash || '',
    model: input.model || '',
    temperature: input.temperature,
    asset_ref: input.asset_ref || '',
    allowed_refs: input.allowed_refs || [],
    doc_file: input.doc_file || '',
    mtime: input.mtime,
    pathname: typeof window !== 'undefined' ? window.location.pathname : '',
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    viewport:
      typeof window !== 'undefined'
        ? { w: window.innerWidth, h: window.innerHeight }
        : undefined,
    console_tail: getConsoleTail(),
    ...(input.extra || {}),
  };

  let text = JSON.stringify(ctx);
  if (byteLen(text) <= MAX_JSON_BYTES) return ctx;

  // 先砍 console_tail
  const copy = { ...ctx, console_tail: (ctx.console_tail || []).slice(-10) };
  text = JSON.stringify(copy);
  if (byteLen(text) <= MAX_JSON_BYTES) return copy;

  // 再丢掉 extra / ua
  const slim: Record<string, any> = {
    gen_id: copy.gen_id,
    gen_type: copy.gen_type,
    outline_id: copy.outline_id,
    target_key: copy.target_key,
    asset_ref: copy.asset_ref,
    allowed_refs: copy.allowed_refs,
    pathname: copy.pathname,
    console_tail: [],
    truncated: true,
  };
  return slim;
}

export function serializeContext(ctx: Record<string, any>): string {
  let text = JSON.stringify(ctx);
  const enc = new TextEncoder();
  if (enc.encode(text).length <= MAX_JSON_BYTES) return text;
  while (enc.encode(text).length > MAX_JSON_BYTES && text.length > 64) {
    text = text.slice(0, Math.floor(text.length * 0.9));
  }
  return text + '/*truncated*/';
}

function byteLen(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** 纯函数：截断任意对象到 ≤32KB JSON 字符串 */
export function clampContextJson(raw: unknown): string {
  if (raw == null) return '';
  const text =
    typeof raw === 'string' ? raw : JSON.stringify(raw ?? {}, null, 0);
  const enc = new TextEncoder();
  const bytes = enc.encode(text);
  if (bytes.length <= MAX_JSON_BYTES) return text;
  const cut = new TextDecoder().decode(bytes.slice(0, MAX_JSON_BYTES - 32));
  return cut + '/*truncated*/';
}
