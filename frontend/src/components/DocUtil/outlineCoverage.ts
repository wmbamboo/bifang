/**
 * 素材覆盖清单：结构段后闸门，专治 C 类漏章。
 * 无结构化抽取库时，用主题/范围启发式必选页语义。
 * 分栏页另有「按栏轴」证据校验（填充阶段，有 tips+evidence）。
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

/**
 * 结构阶段：动作/筛选页题未点名材料轴 → 易在填充时无证据可写诊断语。
 * 在标题树阶段拒收，迫使改页题（比填充重试兜底更有效）。
 */
export function findUnsupportedActionSlideTitles(
  structure: OutlineStructureJson | null | undefined,
): string | null {
  for (const ch of structure?.chapters || []) {
    for (const sl of ch.slides || []) {
      const title = String(sl.title || '').trim();
      if (!title) continue;
      const actionish = /筛选动作|卖点筛选|跟进动作|打法动作|动作清单/.test(title);
      if (!actionish) continue;
      // 「款式」「卖点」单字不够——易写成无证据的对照栏；须点名材料侧轴
      const materialAxis =
        /属性|面料|图案|颜色|材质|价格带|图鉴|爆款|销量|销售额|大盘|占比/.test(title);
      if (!materialAxis) {
        return (
          `页「${title}」偏动作清单且标题未点名材料轴（属性/面料/图案/价格带/图鉴等），` +
          `填充易无证据；请改为「…属性筛选」等贴材料的页题，或并入有证据的页`
        );
      }
    }
  }
  return null;
}

/** 栏轴名：从 `col: xxx` 提取 */
export function extractColumnAxes(tips: string[]): string[] {
  const axes: string[] = [];
  for (const raw of tips || []) {
    const t = String(raw || '').trim();
    const m = t.match(/^(?:col|column|栏)\s*[:：]\s*(.+)$/i);
    if (!m) continue;
    const axis = String(m[1] || '').trim().slice(0, 16);
    if (axis) axes.push(axis);
  }
  return axes;
}

/**
 * 填充阶段·按栏：每个 col 轴须在证据中有可核对痕迹。
 * 品类词（衬衫/polo/大盘）+ 内容词（款式/卖点/属性…）分别放宽匹配。
 */
export function checkColumnAxisEvidence(
  tips: string[],
  evidence: string,
): { ok: boolean; bareAxes: string[]; hint: string } {
  const ev = String(evidence || '');
  if (!ev.trim()) {
    return { ok: true, bareAxes: [], hint: '' };
  }
  const axes = extractColumnAxes(tips);
  if (axes.length < 2) {
    return { ok: true, bareAxes: [], hint: '' };
  }
  const bareAxes: string[] = [];
  for (const axis of axes) {
    if (!columnAxisSupportedByEvidence(axis, ev)) {
      bareAxes.push(axis);
    }
  }
  if (!bareAxes.length) {
    return { ok: true, bareAxes: [], hint: '' };
  }
  return {
    ok: false,
    bareAxes,
    hint:
      `分栏轴「${bareAxes.join('、')}」在本页检索证据中无对应痕迹；` +
      `请改轴名为材料中有的维度（如属性/价格带/品类），或改用 list 写可执行短动作，勿写「材料未覆盖」`,
  };
}

function columnAxisSupportedByEvidence(axis: string, evidence: string): boolean {
  const a = String(axis || '');
  const ev = evidence;
  // 品类轴：证据出现品类词即可
  if (/大盘/.test(a) && /大盘|总销量|总销售额/.test(ev)) return true;
  if (/衬衫/.test(a) && /衬衫/.test(ev)) {
    // 「衬衫款式」还希望有款式/属性痕迹；仅有销量 KPI 时也算弱支持（避免误杀位置页）
    if (/款式|卖点|属性|面料|图案|颜色|材质/.test(a)) {
      return /款式|属性|面料|图案|颜色|材质|纯色|棉|领|袖/.test(ev);
    }
    return true;
  }
  if (/polo|Polo/i.test(a) && /polo|Polo/i.test(ev)) {
    if (/款式|卖点|属性|面料|图案|颜色|材质/.test(a)) {
      return /款式|属性|面料|图案|颜色|材质|纯色|棉|领|袖|占比/.test(ev);
    }
    return true;
  }
  if (/价格带|价位|客单/.test(a) && /价格带|[￥¥]\s*\d+/.test(ev)) return true;
  if (/属性|面料|款式|图案|颜色|卖点/.test(a)) {
    return /属性|面料|款式|图案|颜色|材质|纯色|棉|占比/.test(ev);
  }
  // 其它轴：轴名中 ≥2 字的连续中文片段须在证据出现
  const chunks = a.match(/[\u4e00-\u9fff]{2,}/g) || [];
  if (chunks.some((c) => ev.includes(c))) return true;
  return false;
}
