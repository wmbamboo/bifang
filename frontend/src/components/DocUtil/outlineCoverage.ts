/**
 * 素材覆盖清单：结构段后闸门，专治 C 类漏章。
 * 无结构化抽取库时，用主题/范围启发式必选页语义。
 */

import type { OutlineStructureJson } from '@/components/DocUtil/outlineJson';

export type CoverageItem = {
  id: string;
  label: string;
  /** 标题命中任一即算覆盖 */
  titleHints: string[];
  required: boolean;
};

export type CoverageReport = {
  ok: boolean;
  missing: CoverageItem[];
  hitIds: string[];
  hint: string;
};

/** 从主题/范围推断衬衫/polo 类必选清单；其它主题返回空（不过闸） */
export function buildCoverageChecklist(topicBlob: string): CoverageItem[] {
  const t = String(topicBlob || '');
  const isApparel =
    /衬衫|polo|Polo|男装|选品|爆款|抖音/.test(t) &&
    /衬衫|polo|男装|选品|价格带|大盘/.test(t);
  if (!isApparel) return [];

  const items: CoverageItem[] = [
    {
      id: 'macro',
      label: '男装/品类大盘规模',
      titleHints: ['大盘', '规模', '销量', '销售额'],
      required: true,
    },
    {
      id: 'shirt_kpi',
      label: '衬衫销量/销售额',
      titleHints: ['衬衫'],
      required: /衬衫/.test(t),
    },
    {
      id: 'polo_kpi',
      label: 'polo 销量/销售额',
      titleHints: ['polo', 'Polo'],
      required: /polo|Polo/i.test(t),
    },
    {
      id: 'price_band',
      label: '价格带',
      titleHints: ['价格带', '价位', '客单'],
      required: true,
    },
    {
      id: 'attr',
      label: '属性/面料/款式特征',
      titleHints: ['属性', '面料', '款式', '图案', '颜色', '卖点'],
      required: true,
    },
  ];
  return items.filter((x) => x.required);
}

export function checkStructureCoverage(
  structure: OutlineStructureJson | null | undefined,
  checklist: CoverageItem[],
): CoverageReport {
  if (!checklist.length) {
    return { ok: true, missing: [], hitIds: [], hint: '' };
  }
  const titles: string[] = [];
  for (const ch of structure?.chapters || []) {
    titles.push(String(ch.title || ''));
    for (const sl of ch.slides || []) {
      titles.push(String(sl.title || ''));
    }
  }
  const blob = titles.join('\n');
  const hitIds: string[] = [];
  const missing: CoverageItem[] = [];
  for (const item of checklist) {
    const hit = item.titleHints.some((h) => h && blob.includes(h));
    if (hit) hitIds.push(item.id);
    else missing.push(item);
  }
  const ok = missing.length === 0;
  const hint = ok
    ? ''
    : `结构漏覆盖：${missing.map((m) => m.label).join('、')}。请补对应章/页标题（可写「衬衫销量」「polo 大盘」「价格带」「属性特征」等）。`;
  return { ok, missing, hitIds, hint };
}
