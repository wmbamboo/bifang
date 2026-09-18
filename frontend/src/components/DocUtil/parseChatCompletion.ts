/**
 * 解析聊天补全接口返回。
 * 兼容：OpenAI 对象、旧版 JSON 字符串、毕方 {code,msg} 错误体。
 */
export type ChatCompletionParseResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

export type ParseChatCompletionOptions = {
  /** 知识库写作：无检索命中或模型明确表示库内无依据时视为失败 */
  requireKbHits?: boolean;
};

/** 知识库无检索结果时的统一提示 */
export const KB_GEN_EMPTY_ERROR =
  '内容生成出错，【重选知识库】或检查左侧大纲内容是否符合您的要求。';

/** 去掉模型常见的知识库套话前缀，保留正文 */
export function stripKnowledgeMetaPreamble(text: string): string {
  let s = (text || '').trim();
  if (!s) return s;
  const patterns = [
    /^(根据知识库(?:中的|里的)?(?:相关)?内容[，,。：:\s]*)+/u,
    /^(基于知识库(?:中的|里的)?(?:相关)?内容[，,。：:\s]*)+/u,
    /^(依据知识库(?:中的|里的)?(?:相关)?内容[，,。：:\s]*)+/u,
    /^(根据(?:检索)?(?:结果|资料|文档)[，,。：:\s]*)+/u,
    /^(基于(?:检索)?(?:结果|资料|文档)[，,。：:\s]*)+/u,
    /^(结合知识库(?:内容)?[，,。：:\s]*)+/u,
    /^(参考知识库(?:内容)?[，,。：:\s]*)+/u,
  ];
  let prev = '';
  while (prev !== s) {
    prev = s;
    for (const re of patterns) {
      s = s.replace(re, '').trim();
    }
  }
  return s;
}

/** 模型整段在表达「库里没有」而非正常写作 */
export function isKbInsufficientReply(text: string): boolean {
  const s = (text || '').trim();
  if (!s) return true;
  const hit =
    /无法从知识库|知识库中没有检索到|未检索到相关内容|知识库不足以|知识库未提供|没有检索到相关|无法从知识库得到答案/.test(
      s,
    );
  if (!hit) return false;
  // 若同时含正常小项编号，可能是部分点不足，仍视为可用正文
  const hasListItems = /^\s*\d{1,2}\s*[\.．、]/m.test(s) && s.split('\n').filter(Boolean).length >= 2;
  return !hasListItems;
}

export function parseChatCompletionData(
  resData: unknown,
  options?: ParseChatCompletionOptions,
): ChatCompletionParseResult {
  if (resData == null) {
    return { ok: false, error: '空响应' };
  }

  let payload: any = resData;
  if (typeof resData === 'string') {
    const trimmed = resData.trim();
    if (!trimmed) {
      return { ok: false, error: '空响应字符串' };
    }
    try {
      payload = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: '响应不是合法 JSON' };
    }
  }

  if (typeof payload !== 'object') {
    return { ok: false, error: String(payload) };
  }

  // 毕方业务错误：{ code, msg }
  if (
    payload.code !== undefined &&
    payload.code !== 200 &&
    !Array.isArray(payload.choices)
  ) {
    return {
      ok: false,
      error: payload.msg || payload.message || `错误码 ${payload.code}`,
    };
  }

  if (options?.requireKbHits) {
    const docs = payload.docs;
    if (!Array.isArray(docs) || docs.length === 0) {
      return { ok: false, error: KB_GEN_EMPTY_ERROR };
    }
  }

  const choices = payload.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const content =
      choices[0]?.message?.content ??
      choices[0]?.delta?.content ??
      choices[0]?.text ??
      '';
    if (typeof content === 'string' && content.length > 0) {
      const cleaned = stripKnowledgeMetaPreamble(content);
      if (!cleaned) {
        return { ok: false, error: '模型返回空内容' };
      }
      if (options?.requireKbHits && isKbInsufficientReply(cleaned)) {
        return { ok: false, error: KB_GEN_EMPTY_ERROR };
      }
      return { ok: true, content: cleaned };
    }
    return { ok: false, error: '模型返回空内容' };
  }

  return {
    ok: false,
    error: payload.msg || payload.message || '无法解析模型返回',
  };
}

/** 文章/PPT 内容生成用的系统提示 */
export const WRITING_SYSTEM_PROMPT =
  '你是专业文档撰写助手。请直接输出可直接采用的正文内容，不要出现「根据知识库内容」「根据资料」等套话或过程说明，不要复述用户的任务要求。';

/**
 * 知识库写作追加约束（拼在 user 写作 prompt 末尾）。
 * 后端会用检索结果替换 system；此处再次强调，避免模型抛开检索自由发挥。
 */
export const KB_WRITING_CONSTRAINT_PROMPT =
  '\n\n【知识库约束】\n' +
  '1. 只依据系统消息中的知识库检索结果撰写。\n' +
  '2. 不得使用检索结果之外的常识补全，不得编造数据、案例或结论。\n' +
  '3. 检索结果不足以支撑某一点时，仍保留该小点，描述写「知识库未提供依据」，不要跳过，也不要另起新点臆造。\n' +
  '4. 具体数字、专有名词须与检索内容一致，可在句末用 [1][2] 标注引用。\n';
