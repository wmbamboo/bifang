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
import { countNumericUnitGroups } from "@/components/DocUtil/outlineJson";
import { DEFAULT_LLM_MODEL } from "@/constants/llm";

export type ShortenItem = { title: string; content: string };

export type ShortenFail = { index: number; len: number; dMax: number };

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
  opts?: { forceHeavy?: boolean },
): string {
  const len = pptItemLength(item.content);
  const heavy =
    !!opts?.forceHeavy ||
    len > dMax * 1.4 ||
    countNumericUnitGroups(item.content) >= 2;
  const rule = heavy
    ? `压缩到 ${dMax} 字以内是硬限制。允许删去次要主体名称与过程细节，只保留「谁用什么方式拿到多少」这类结论性事实，` +
      `数字最多保留 2 组（优先与标题直接相关的）。不要新增事实。`
    : `压缩到 ${dMax} 字以内，保留全部数字，只删连接词与重复限定，不要新增内容。`;
  return (
    `${rule}\n不要用 [文档N]，不要输出任何来源标注。只输出压缩后的描述正文，不要标题、编号或前言。\n` +
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
  forceHeavy?: boolean;
}): Promise<string | null> {
  const {
    item,
    dMax,
    url,
    extraUserSuffix = "",
    requireKbHits = false,
    model = DEFAULT_LLM_MODEL,
    forceHeavy = false,
  } = opts;
  const prompt =
    buildShortenItemPrompt(item, dMax, { forceHeavy }) + extraUserSuffix;
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
 * 超长条目自动精简：最多 6 条；必须压到 ≤dMax 才算成功，否则记入 failed。
 */
export async function autoShortenOverlongItems(
  items: ShortenItem[],
  layout: SlideLayout | string | undefined,
  shortenFn: (
    index: number,
    item: ShortenItem,
    dMax: number,
    opts?: { forceHeavy?: boolean },
  ) => Promise<string | null>,
  opts?: { metricCount?: number; maxItems?: number },
): Promise<{ items: ShortenItem[]; shortened: number; failed: ShortenFail[] }> {
  const metricCount = opts?.metricCount ?? 0;
  const maxItems = opts?.maxItems ?? 6;
  const next = items.map((it) => ({ ...it }));
  let shortened = 0;
  const failed: ShortenFail[] = [];
  for (let i = 0; i < next.length; i++) {
    if (shortened >= maxItems) break;
    const dMax = descMaxForPptItem(layout, i, metricCount);
    const len = pptItemLength(next[i].content);
    if (len <= dMax) continue;
    let compressed = await shortenFn(i, next[i], dMax).catch(() => null);
    if (compressed && pptItemLength(compressed) > dMax) {
      compressed = await shortenFn(i, next[i], dMax, { forceHeavy: true }).catch(
        () => null,
      );
    }
    if (compressed && pptItemLength(compressed) <= dMax) {
      next[i] = { ...next[i], content: compressed };
      shortened += 1;
    } else {
      failed.push({
        index: i,
        len: compressed ? pptItemLength(compressed) : len,
        dMax,
      });
    }
  }
  return { items: next, shortened, failed };
}

export function metricCountFromSubTitle(subTitle: string | undefined): number {
  return splitMetricListTips(subTitle || "").metrics.length;
}
