/**
 * 素材覆盖清单：结构段后闸门，专治 C 类漏章。
 * 无结构化抽取库时，用主题/范围启发式必选页语义。
 * 分栏页另有「按栏轴」证据校验（填充阶段，有 tips+evidence）。
 */

import type { OutlineStructureJson } from '@/components/DocUtil/outlineJson';
import {
  ATTR_AXIS_LEXICON,
  buildCoverageItemsFromProfile,
  type CorpusAttrAxis,
} from '@/components/DocUtil/corpusProfile';
import { hasPriceBand } from '@/components/DocUtil/priceBandAtom';

export { ATTR_AXIS_LEXICON };
export type { CorpusAttrAxis };

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

/** 从当前语料画像推断必选清单；主题未命中画像 detectHints 则返回空（不过闸） */
export function buildCoverageChecklist(topicBlob: string): CoverageItem[] {
  return buildCoverageItemsFromProfile(topicBlob);
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

/**
 * 属性轴互斥：词表见 corpusProfile / apparel.json（ATTR_AXIS_LEXICON 为 live binding）。
 * 卡题含轴 A 时，同卡数据不得主要是轴 B 的专属标签。
 */

function countExclusiveLabels(text: string, labels: readonly string[]): number {
  const s = String(text || '');
  let n = 0;
  for (const lab of labels) {
    if (lab && s.includes(lab)) n += 1;
  }
  return n;
}

/** 轴名/长 hint 命中；shortHintNeedsLabel 时无完整轴名则须专属 label（防「袖」误触） */
function axisHintMatches(row: CorpusAttrAxis, s: string): boolean {
  if (s.includes(row.axis)) return true;
  const longHint = row.titleHints.some((h) => h.length >= 2 && s.includes(h));
  if (!longHint) return false;
  if (!row.shortHintNeedsLabel) return true;
  return row.labels.some((lab) => lab && s.includes(lab));
}

/** 从页题或 tip 行解析属性轴（优先画像中靠前的轴） */
export function detectAttrAxisInText(text: string): string | null {
  const s = String(text || '');
  if (!s.trim()) return null;
  for (const row of ATTR_AXIS_LEXICON) {
    if (axisHintMatches(row, s)) return row.axis;
  }
  return null;
}

/** 从页题解析全部属性轴（多轴标题如「厚薄与款式」） */
export function detectAllAttrAxesInText(text: string): string[] {
  const s = String(text || '');
  if (!s.trim()) return [];
  const out: string[] = [];
  for (const row of ATTR_AXIS_LEXICON) {
    if (axisHintMatches(row, s)) out.push(row.axis);
  }
  return out;
}

/**
 * 轴标签计数：「常规」在厚薄/袖型两柱都会出现，仅当正文已点名该轴时计入本轴。
 */
function countAxisLabels(axis: string, text: string, axisMentioned: boolean): number {
  const row = ATTR_AXIS_LEXICON.find((r) => r.axis === axis);
  if (!row) return 0;
  let n = countExclusiveLabels(text, row.labels);
  // 「常规 79.76%」是袖型/厚薄主力项；即使同页还有「常规袖」也要计本轴（P13）
  if (axisMentioned && (axis === '袖型' || axis === '厚薄')) {
    if (/常规\s*\d/.test(text)) {
      n += 1;
    } else if (/常规/.test(text) && !/常规袖/.test(text)) {
      n += 1;
    }
  }
  return n;
}

/**
 * 五·4.1：分栏列内标签须与列头同轴（面料列出现「纯色/动物图案」即拒）。
 */
export function checkColumnItemAxisAlign(
  tips: string[],
): {ok: boolean; hint: string} {
  type Col = {axisHint: string; items: string[]};
  const cols: Col[] = [];
  let cur: Col | null = null;
  for (const tip of tips || []) {
    const raw = String(tip || '').trim();
    if (!raw) continue;
    const colM = raw.match(/^(?:col|column|栏)\s*[:：]\s*(.+)$/i);
    if (colM) {
      cur = {axisHint: String(colM[1] || '').trim(), items: []};
      cols.push(cur);
      continue;
    }
    if (/^(?:colSub|columnSub|栏副|副标|layout)\s*[:：]/i.test(raw)) continue;
    if (!cur) continue;
    cur.items.push(
      raw.replace(/^(?:metric|list)\s*[:：]\s*/i, '').trim(),
    );
  }
  if (cols.length < 2) return {ok: true, hint: ''};

  for (const col of cols) {
    const axis = detectAttrAxisInText(col.axisHint);
    if (!axis) continue;
    const body = col.items.join('\n');
    if (!body.trim()) continue;
    const selfRow = ATTR_AXIS_LEXICON.find((r) => r.axis === axis);
    const selfLabs = new Set(selfRow?.labels || []);
    for (const other of ATTR_AXIS_LEXICON) {
      if (other.axis === axis) continue;
      for (const lab of other.labels) {
        if (!lab || lab.length < 2) continue;
        if (selfLabs.has(lab)) continue; // 跨轴共享词跳过
        if (body.includes(lab)) {
          return {
            ok: false,
            hint:
              `分栏「${col.axisHint.slice(0, 12)}」列头属「${axis}」，` +
              `但栏内出现「${other.axis}」标签「${lab}」；列内标签须与列头同轴`,
          };
        }
      }
    }
  }
  return {ok: true, hint: ''};
}

/**
 * 属性分布页：证据中该轴占比最大的标签须出现在 tips（防丢掉「常规 79.76%」）。
 */
export function findMissingDominantAttrShare(
  title: string,
  tips: string[],
  evidence: string,
): string | null {
  const axis = detectAttrAxisInText(title);
  if (!axis) return null;
  const row = ATTR_AXIS_LEXICON.find((r) => r.axis === axis);
  if (!row) return null;
  const ev = String(evidence || '');
  if (!ev.trim()) return null;
  const labels = [...row.labels];
  if (axis === '袖型' || axis === '厚薄') {
    if (!labels.includes('常规')) labels.push('常规');
  }
  let bestLabel = '';
  let bestPct = -1;
  for (const lab of labels) {
    if (!lab) continue;
    const re = new RegExp(
      `${lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\d+(?:\\.\\d+)?)\\s*[%％]`,
      'g',
    );
    for (const m of ev.matchAll(re)) {
      const pct = parseFloat(m[1] || '');
      if (Number.isFinite(pct) && pct > bestPct) {
        bestPct = pct;
        bestLabel = lab;
      }
    }
  }
  if (!bestLabel || bestPct < 30) return null;
  const blob = (tips || []).join('\n');
  // 「常规袖」contains「常规」——须「常规 + 数字」才算覆盖主力项
  const covered =
    bestLabel === '常规'
      ? /常规\s*\d/.test(blob)
      : blob.includes(bestLabel);
  if (covered) return null;
  return (
    `属性页须含份额最大项「${bestLabel} ${bestPct}%」` +
    `（证据已有，勿只列尾项` +
    (bestLabel === '常规' ? '；「常规袖」不能代替「常规」' : '') +
    `）`
  );
}

/**
 * 填充阶段·卡题轴：页题或 tip 卡头的属性轴，须与同卡数据标签一致，且证据有该轴痕迹。
 * 专治「袖型」卡装厚薄、「图案验证」卡只堆面料占比。
 */
export function checkCardTitleAxisEvidence(
  title: string,
  tips: string[],
  evidence: string,
): {ok: boolean; hint: string} {
  const tipList = (tips || []).map((t) => String(t || '').trim()).filter(Boolean);
  if (!tipList.length) return {ok: true, hint: ''};

  type Check = {axis: string; body: string; where: string};
  const checks: Check[] = [];

  const pageAxes = detectAllAttrAxesInText(title);
  // 单轴页题才做整页聚合校验；「厚薄与款式」等复合属性标题只查各 tip，避免邻轴互杀
  const multiAttrTitle =
    pageAxes.length > 1 ||
    (/厚薄|面料|图案|袖型/.test(String(title || '')) &&
      /款式|属性/.test(String(title || '')) &&
      /与|及|、/.test(String(title || '')));
  if (pageAxes.length === 1 && !multiAttrTitle) {
    checks.push({
      axis: pageAxes[0],
      body: tipList.join('\n'),
      where: `页题「${String(title).slice(0, 16)}」`,
    });
  }

  // tip 自身像卡头（含轴名 + 短）或「轴名：数据」同行
  for (const tip of tipList) {
    const axis = detectAttrAxisInText(tip);
    if (!axis) continue;
    const afterColon = tip.split(/[:：]/).slice(1).join('：').trim();
    const tipHasOwnMetric = /[%％]/.test(tip);
    // 本 tip 已带轴名+占比时，只用本 tip 正文，禁止拿同页邻轴 tip 当「要点」误杀
    // （如「袖型常规 79.76%：…」数字在冒号前，旧逻辑会误用厚薄兄弟 tip）
    const body =
      afterColon && /[%％\d]/.test(afterColon)
        ? afterColon
        : tipHasOwnMetric
          ? tip
          : tipList.filter((t) => t !== tip).join('\n') || tip;
    // 仅当 tip 点名轴、且另有数据可核时才查（避免「面料页」总览误杀）
    if (
      !/[%％]/.test(body) &&
      countExclusiveLabels(
        body,
        ATTR_AXIS_LEXICON.flatMap((r) => [...r.labels]),
      ) < 2
    ) {
      continue;
    }
    checks.push({
      axis,
      body,
      where: `卡头「${tip.slice(0, 18)}」`,
    });
  }

  const ev = String(evidence || '');
  for (const c of checks) {
    const row = ATTR_AXIS_LEXICON.find((r) => r.axis === c.axis);
    if (!row) continue;
    const axisMentioned =
      c.body.includes(c.axis) ||
      c.where.includes(c.axis) ||
      String(title || '').includes(c.axis);
    // 面料/材质/图案等属性轴：禁止把价格带区间占比挂到本页（串窗）
    if (
      /面料|材质|图案|厚薄|袖型/.test(c.axis) &&
      hasPriceBand(c.body)
    ) {
      const selfHitsEarly = countAxisLabels(c.axis, c.body, axisMentioned);
      if (selfHitsEarly === 0) {
        return {
          ok: false,
          hint:
            `${c.where}点名「${c.axis}」，但要点含价格带区间且无该轴标签` +
            `（如${row.labels.slice(0, 3).join('、')}）；禁止用¥价带占比充面料/属性页`,
        };
      }
    }
    const selfHits = countAxisLabels(c.axis, c.body, axisMentioned);
    let bestOther: {axis: string; n: number} | null = null;
    for (const other of ATTR_AXIS_LEXICON) {
      if (other.axis === c.axis) continue;
      const otherMentioned =
        c.body.includes(other.axis) || String(title || '').includes(other.axis);
      const n = countAxisLabels(other.axis, c.body, otherMentioned);
      if (!bestOther || n > bestOther.n) bestOther = {axis: other.axis, n};
    }
    // 正文几乎全是别轴专属标签、本轴专属几乎没有 → 张冠李戴
    if (bestOther && bestOther.n >= 2 && selfHits === 0) {
      return {
        ok: false,
        hint:
          `${c.where}点名「${c.axis}」，但要点标签属「${bestOther.axis}」` +
          `（如${ATTR_AXIS_LEXICON.find((r) => r.axis === bestOther!.axis)?.labels.slice(0, 3).join('、')}）；` +
          `请改标题对齐数据，或改写为材料中该轴的占比`,
      };
    }
    if (bestOther && bestOther.n >= 2 && selfHits > 0 && bestOther.n >= selfHits + 2) {
      return {
        ok: false,
        hint:
          `${c.where}点名「${c.axis}」，但要点更像「${bestOther.axis}」分布；` +
          `请勿把邻列属性数据挂到本卡标题下`,
      };
    }
    // 有证据时：轴名或专属标签须在证据出现（袖型页不得只召回厚薄段）
    if (ev.trim()) {
      const axisInEv =
        ev.includes(c.axis) ||
        row.labels.some((lab) => lab.length >= 2 && ev.includes(lab)) ||
        // 袖型/厚薄柱常见「常规 xx%」
        ((c.axis === '袖型' || c.axis === '厚薄') &&
          ev.includes(c.axis) &&
          /常规\s*\d/.test(ev));
      if (!axisInEv) {
        return {
          ok: false,
          hint:
            `${c.where}点名「${c.axis}」，但本页检索证据无该轴痕迹；` +
            `请换有「${c.axis}」占比的材料，或改标题/并入有证据的页`,
        };
      }
    }
  }
  return {ok: true, hint: ''};
}
