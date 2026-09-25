/**
 * 复合版式 tips 槽位：在平铺数组上标注 slotGroup，供编辑 UI 分组。
 * 仍兼容 col:/metric:/list: 前缀序列化。
 */

export type TipSlotGroup = 'metric' | 'list' | `col${number}` | 'body';

export type OutlineTipSlot = {
  text: string;
  slotGroup: TipSlotGroup;
};

/** 从 tips 字符串解析槽位分组 */
export function tipsToSlots(tips: string[]): OutlineTipSlot[] {
  const out: OutlineTipSlot[] = [];
  let colIdx = 0;
  for (const raw of tips || []) {
    const t = String(raw || '').trim();
    if (!t) continue;
    if (/^metric\s*[:：]/i.test(t)) {
      out.push({ text: t.replace(/^metric\s*[:：]\s*/i, ''), slotGroup: 'metric' });
      continue;
    }
    if (/^list\s*[:：]/i.test(t)) {
      out.push({ text: t.replace(/^list\s*[:：]\s*/i, ''), slotGroup: 'list' });
      continue;
    }
    if (/^(?:col|column|栏)\s*[:：]/i.test(t)) {
      colIdx += 1;
      out.push({ text: t, slotGroup: `col${colIdx}` });
      continue;
    }
    if (/^(?:colSub|栏副)\s*[:：]/i.test(t)) {
      out.push({ text: t, slotGroup: colIdx > 0 ? `col${colIdx}` : 'body' });
      continue;
    }
    if (colIdx > 0) {
      out.push({ text: t, slotGroup: `col${colIdx}` });
    } else {
      out.push({ text: t, slotGroup: 'body' });
    }
  }
  return out;
}

/** 槽位写回 tips（保留 metric:/list:/col: 前缀约定） */
export function slotsToTips(slots: OutlineTipSlot[]): string[] {
  return (slots || []).map((s) => {
    const text = String(s.text || '').trim();
    if (!text) return '';
    if (s.slotGroup === 'metric' && !/^metric\s*[:：]/i.test(text)) {
      return `metric: ${text}`;
    }
    if (s.slotGroup === 'list' && !/^list\s*[:：]/i.test(text)) {
      return `list: ${text}`;
    }
    return text;
  }).filter(Boolean);
}

/** metric_columns：模板没有的组合 → 降级建议 */
export function downgradeMetricColumns(
  metricCount: number,
  colCount: number,
): { metricCount: number; colCount: number; layout: 'metric_columns' | 'metric_list'; note?: string } {
  const m = Math.max(2, Math.min(5, Math.round(metricCount) || 4));
  let c = Math.max(2, Math.min(5, Math.round(colCount) || 2));
  // 仅 5 卡支持 3 栏
  if (c >= 3 && m < 5) {
    return { metricCount: m, colCount: 2, layout: 'metric_columns', note: '3栏需5卡，已降为2栏' };
  }
  if (c >= 4) {
    return { metricCount: m, colCount: 2, layout: 'metric_columns', note: '栏数>3 降为2栏' };
  }
  if (c >= 3 && m >= 5) {
    return { metricCount: 5, colCount: 3, layout: 'metric_columns' };
  }
  return { metricCount: m, colCount: Math.min(c, 2), layout: 'metric_columns' };
}
