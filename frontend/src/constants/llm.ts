/**
 * 前端请求里的默认 LLM 名。
 * 传 `auto` 时由后端 `DEEPSEEK_MODEL`（.env）决定，避免再写死旧 glm4 名。
 */
export const DEFAULT_LLM_MODEL = 'auto' as const;

/**
 * 强模型：只用于大纲填充里难页（分栏 / 数据+分栏）及该页重试。
 * 结构规划与 list/metric 页仍走 DEFAULT_LLM_MODEL。
 */
export const STRONG_LLM_MODEL = 'deepseek-reasoner' as const;

/** 这些版式的 tips 填充走强模型 */
export const STRONG_FILL_LAYOUTS = ['columns', 'metric_columns'] as const;
