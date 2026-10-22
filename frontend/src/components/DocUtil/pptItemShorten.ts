/**
 * PPT 小项描述精简：与 SliderDrawer / 生成后自动重试共用同一套 prompt 口径。
 */
import axios from "@/utils/authAxios";
import {
  parseChatCompletionData,
  stripHallucinatedDocCitations,
  WRITING_SYSTEM_PROMPT,
} from "@/components/DocUtil/parseChatCompletion";
import {
  pptItemLength,
  scrubPptItemText,
  PPT_ITEM_DESC_MAX,
  PPT_METRIC_DESC_MAX,
  SlideLayout,
  splitMetricListTips,
} from "@/components/DocUtil/ViewItem4Ppt";
import { DEFAULT_LLM_MODEL } from "@/constants/llm";

export type ShortenItem = { title: string; content: string };

export function descMaxForPptItem(
  layout: SlideLayout | string | undefined,
  index: number,
  metricCount = 0,
): number {
  const lay = layout || "list";
  if (lay === "metric") return PPT_METRIC_DESC_MAX;
  if (lay === "metric_list" || lay === "metric_columns") {
    return index < metricCount ? PPT_METRIC_DESC_MAX : lay === "metric_columns" ? 28 : PPT_ITEM_DESC_MAX;
  }
  if (lay === "columns") return 28;
  return PPT_ITEM_DESC_MAX;
}

/** 构建与页面 shortenSlideItem 一致的压缩 prompt（勿另起一份）。 */
export function buildShortenItemPrompt(
  item: ShortenItem,
  dMax: number,
): string {
  return (
    `把下面这句压缩到 ≤${dMax} 字，保留全部数字与出处，只删连接词与重复限定，不要新增内容。` +
    `不要用 [文档N]，不要输出任何来源标注。只输出压缩后的描述正文，不要标题、编号或前言。\n` +
    `标题：${item.title}\n描述：${item.content}`
  );
}

export function normalizeShortenResponse(raw: string): string {
  let text = scrubPptItemText(raw || "");
  const m = text.match(/^\d+[.．、]\s*.+?\s*[-—–]\s*(.+)$/s);
  if (m) text = scrubPptItemText(m[1]);
  return stripHallucinatedDocCitations(text).text.trim();
}

export async function shortenPptItemDesc(opts: {
  item: ShortenItem;
  dMax: number;
  url: string;
  extraUserSuffix?: string;
  requireKbHits?: boolean;
  model?: string;
}): Promise<string | null> {
  const {
    item,
    dMax,
    url,
    extraUserSuffix = "",
    requireKbHits = false,
    model = DEFAULT_LLM_MODEL,
  } = opts;
  const prompt = buildShortenItemPrompt(item, dMax) + extraUserSuffix;
  const msg = {
    messages: [
      { content: WRITING_SYSTEM_PROMPT, role: "system", name: "string" },
      { content: prompt, role: "user", name: "string" },
    ],
    model,
    frequency_penalty: 0,
    stream: false,
    temperature: 0.3,
    top_logprobs: 0,
    top_p: 0,
  };
  try {
    const res = await axios.post(url, JSON.stringify(msg), {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    const parsed = parseChatCompletionData(res.data, { requireKbHits });
    if (!parsed.ok) return null;
    const text = normalizeShortenResponse(parsed.content || "");
    return text || null;
  } catch {
    return null;
  }
}

/**
 * 超长条目自动精简：最多 3 条；单条失败静默保留原文。
 * shortenFn 应复用页面 shortenSlideItem / shortenPptItemDesc。
 */
export async function autoShortenOverlongItems(
  items: ShortenItem[],
  layout: SlideLayout | string | undefined,
  shortenFn: (
    index: number,
    item: ShortenItem,
    dMax: number,
  ) => Promise<string | null>,
  opts?: { metricCount?: number; maxItems?: number },
): Promise<{ items: ShortenItem[]; shortened: number }> {
  const metricCount = opts?.metricCount ?? 0;
  const maxItems = opts?.maxItems ?? 3;
  const next = items.map((it) => ({ ...it }));
  let shortened = 0;
  for (let i = 0; i < next.length; i++) {
    if (shortened >= maxItems) break;
    const dMax = descMaxForPptItem(layout, i, metricCount);
    if (pptItemLength(next[i].content) <= dMax) continue;
    try {
      const compressed = await shortenFn(i, next[i], dMax);
      if (compressed && pptItemLength(compressed) > 0) {
        next[i] = { ...next[i], content: compressed };
        shortened += 1;
      }
    } catch {
      // 静默保留原文
    }
  }
  return { items: next, shortened };
}

export function metricCountFromSubTitle(subTitle: string | undefined): number {
  return splitMetricListTips(subTitle || "").metrics.length;
}
