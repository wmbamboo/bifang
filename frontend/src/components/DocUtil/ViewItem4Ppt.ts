import OutlineRec,{outlineType} from "@/components/DocUtil/OutlineStore";

export class PptKeys{
  chapterKey:string;
  slideKey:string;
  constructor(chapterKey:string,slideKey:string) {
    this.chapterKey = chapterKey;
    this.slideKey = slideKey;
  }
}
const charsToReplace=[
  "\_"," ","#",   //":","\*","\+",
  "＋","——","－",
  "1","2","3","4","5","6","7","8","9","0",
  "一","二","三","四","五","六","七","八","九","十",
  "I","II","III","IV","VI","VII",
  "第","部分","章","节","段","幻灯片",
  "：",
  "Chapter",
]
/**
 * 清除一些特殊字符：charsToRplaced，以及*-+。.等
 * @param charsToReplace
 * @param bigString
 */
const replaceCharsInString=(charsToReplace: string[], bigString: string)=>{
  // 遍历数组中的每个字符
  charsToReplace.forEach((char) => {
    // 使用正则表达式全局替换字符（'g' 标志表示全局匹配）
    bigString = bigString.replace(new RegExp(char, 'g'), '');
  });
  bigString= bigString.replace(/[.*+-。]/g,'')
  return bigString;
}
/** 仅用于少数需要「去序号噪音」的场景；幻灯片展示标题不要用（会误删「三大打法」里的「三」）。 */
const cleanString=(bigString: string): string=> {
  return replaceCharsInString(charsToReplace,bigString)
}

/** 幻灯片标题轻清洗：不去掉中文数字/「第」等正文用字。 */
export const cleanSlideTitle = (raw: string): string => {
  return String(raw || '')
    .replace(/^#+\s*/, '')
    .replace(/^[\d０-９]{1,2}[.．、]\s*/, '')
    .replace(/^幻灯片\s*[\d０-９]+\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
};

/**
 * 从幻灯片要点推断页标题（避免「未命名幻灯片」）。
 */
export function deriveSlideTitleFromTips(subTitle: string, layout?: string): string {
  const lines = (subTitle || '')
    .split('\n')
    .map((l) => l.replace(/^(?:[-*+•＊]\s+|＞\s*|>\s*)/, '').trim())
    .filter(Boolean)
    .filter((l) => !parseLayoutLine(l))
    .filter((l) => !/^(?:chapterSub|章副|章副标|章节副标题)\s*[:：]/i.test(l));
  for (const line of lines) {
    const col = line.match(/^(?:col|column|栏)\s*[:：]\s*(.+)$/i);
    if (col?.[1]) {
      const t = col[1].trim().slice(0, 16);
      return t ? `${t}对照` : '';
    }
  }
  const metrics = lines.filter((l) => /^(?:metric\s*[:：]|list\s*[:：])/i.test(l) || countMetricSignals(l) > 0);
  if ((layout === 'metric' || layout === 'metric_columns' || metrics.length >= 2) && metrics.length) {
    return '关键指标一览';
  }
  for (const line of lines) {
    const body = line
      .replace(/^(?:metric|list|colSub|栏副|副标)\s*[:：]\s*/i, '')
      .trim();
    if (body.length >= 2 && body.length <= 20 && !/^(?:col|column|栏)\s*[:：]/i.test(line)) {
      return body.slice(0, 20);
    }
  }
  if (layout === 'columns') return '分栏对照';
  if (layout === 'metric_columns') return '数据与要点';
  if (layout === 'metric') return '关键指标';
  return '';
}

/**
 * 去掉「第一章」「第1章」等序号前缀，仅保留章节主题（序号只用于分组）。
 */
export const stripChapterOrdinalPrefix = (title: string): string => {
  return String(title || '')
    .replace(/^第\s*[一二三四五六七八九十百零〇两\d]+\s*章\s*[：:\-—–．.、]?\s*/u, '')
    .replace(/^Chapter\s*\d+\s*[:：.\-—–]?\s*/i, '')
    .trim();
};

/**
 * 按幻灯片标题语义生成任务说明（避免一律写「怎么做」）。
 */
export const buildSlideTaskInstruction=(slideTitle: string): string => {
  const t = (slideTitle || '').trim();
  if (!t) {
    return '请围绕本页主题展开关键要点。';
  }
  if (/怎么做|如何做|步骤|流程|方法|操作|落地|实施|执行|路径/.test(t)) {
    return `请围绕「${t}」说明具体做法、关键动作与注意点。`;
  }
  if (/规模|增速|数据|指标|大盘|趋势|洞察|分析|研判|监测|统计/.test(t)) {
    return `请围绕「${t}」给出关键口径、现状判断与可支撑决策的分析结论（不是操作步骤清单）。`;
  }
  if (/对比|比较|差异|竞品|对标/.test(t)) {
    return `请围绕「${t}」从对比维度给出差异要点与结论。`;
  }
  if (/原因|为何|为什么|问题|风险|挑战/.test(t)) {
    return `请围绕「${t}」分析成因、影响与需要关注的点。`;
  }
  if (/建议|策略|选品|筛选|推荐|机会|打法/.test(t)) {
    return `请围绕「${t}」给出可执行建议与判断依据。`;
  }
  if (/总结|回顾|展望|结论/.test(t)) {
    return `请围绕「${t}」归纳核心结论与下一步方向。`;
  }
  if (/定义|概念|是什么|概述|简介|背景/.test(t)) {
    return `请围绕「${t}」清晰界定概念要点、边界与背景。`;
  }
  if (/案例|示例|样本|爆品/.test(t)) {
    return `请围绕「${t}」提炼可复用的案例要点与启示。`;
  }
  return `请围绕「${t}」展开本页应讲清的关键要点（按标题语义组织，勿机械写成操作步骤）。`;
};
/****用于清除```markdown\清除前导和结尾空行等标识```*****/
export const clean4PptTitle = (str: string, fallbackTitle?: string) => {
  return normalizePptOutlineMarkdown(str || '', fallbackTitle);
}

/** 归一化时写入的占位名，保存时应用主题替换 */
export const isPlaceholderPptOutlineTitle = (title: string): boolean => {
  const t = (title || '').trim();
  return !t || /^(PPT大纲|未命名PPT|未命名大纲)$/i.test(t);
};

/**
 * 纠正模型常见漏写：去围栏/前文、全角＃、缺空格标题、####→###；
 * 若缺少全文「# 」标题则用 fallbackTitle（主题）或首章名补上；章下漏 ### 时补幻灯片行。
 */
export function normalizePptOutlineMarkdown(raw: string, fallbackTitle?: string): string {
  const preferred = (fallbackTitle || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  let s = (raw || '').replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
  s = s.replace(/```(?:markdown|md|txt)?\s*\n?/gi, '').replace(/```/g, '');
  s = s.replace(/＃/g, '#');
  // #标题 / ##章 / ###页 → 补空格
  s = s.replace(/^(#{1,6})([^\s#])/gm, '$1 $2');
  const firstHeading = s.search(/^#{1,6}\s+/m);
  if (firstHeading > 0) s = s.slice(firstHeading);
  s = s.replace(/^#{4,6}\s+/gm, '### ');

  const pickDocTitle = (): string => {
    if (preferred) return preferred;
    const ch = s.match(/^##\s+(.+)$/m);
    const fromChapter = (ch?.[1] || '').trim().slice(0, 40);
    return fromChapter || '未命名PPT';
  };

  // 模型常漏全文一级标题，直接从 ## 起写 → 保存会失败；用主题或首章名补「# 」
  if (!/^#\s+(?!#)/m.test(s)) {
    const lines0 = s.split('\n');
    let inserted = false;
    for (let i = 0; i < lines0.length; i++) {
      const t = lines0[i].trim();
      if (!t) continue;
      if (/^#{1,6}\s/.test(t)) break;
      // 文首短行当作标题提升为 #（排除「好的/以下是」类套话）
      if (
        !/^(?:[-*+•＊]\s+|＞\s*|>\s*)/.test(t) &&
        !/^(好的|以下是|如下|大纲如下)/.test(t) &&
        t.length >= 2 &&
        t.length <= 48
      ) {
        const title = t.replace(/^【\s*/, '').replace(/\s*】$/, '').trim();
        lines0[i] = `# ${title || pickDocTitle()}`;
        inserted = true;
      }
      break;
    }
    s = lines0.join('\n');
    if (!inserted && !/^#\s+(?!#)/m.test(s)) {
      s = `# ${pickDocTitle()}\n${s.replace(/^\s+/, '')}`;
    }
  }

  // 占位一级标题 → 换成主题
  if (preferred) {
    s = s.replace(/^#\s+(?:PPT大纲|未命名PPT|未命名大纲)\s*$/m, `# ${preferred}`);
  }

  // 若一级标题不在文首（前面还有空行/杂讯），挪到开头
  {
    const lines0 = s.split('\n');
    const h1Idx = lines0.findIndex((ln) => /^#\s+(?!#)/.test(ln.trim()));
    if (h1Idx > 0) {
      const [h1] = lines0.splice(h1Idx, 1);
      s = [h1.trim(), ...lines0].join('\n').trim();
    }
  }

  const lines = s.split('\n');
  const out: string[] = [];
  let inChapter = false;
  let hasSlideInChapter = false;

  /** 章下无 ### 时：按 layout 块（或长清单）拆成多页，避免「一章一页」假结构 */
  const emitSlidesFromOrphanTips = (startIdx: number): number => {
    const tipLines: string[] = [];
    let end = startIdx;
    for (let j = startIdx; j < lines.length; j++) {
      const lj = lines[j].trim();
      if (!lj) {
        end = j;
        continue;
      }
      if (/^#{1,6}\s/.test(lj)) break;
      const body = lj.replace(/^(?:[-*+•＊]\s+|＞\s*|>\s*)/, '');
      // 章副标题不是幻灯片要点，原样写回，不参与补 ###
      if (/^(?:chapterSub|章副|章副标|章节副标题)\s*[:：]/i.test(body)) {
        out.push(lines[j]);
        end = j;
        continue;
      }
      tipLines.push(lines[j]);
      end = j;
    }
    if (!tipLines.length) return end;

    const blocks: string[][] = [];
    let cur: string[] = [];
    for (const rawLine of tipLines) {
      const b = rawLine.trim().replace(/^(?:[-*+•＊]\s+|＞\s*|>\s*)/, '');
      if (parseLayoutLine(b) && cur.length) {
        blocks.push(cur);
        cur = [rawLine];
      } else {
        cur.push(rawLine);
      }
    }
    if (cur.length) blocks.push(cur);

    // 无 layout、要点很多：按每页约 4 条拆开
    if (blocks.length === 1) {
      const only = blocks[0];
      const hasLayout = only.some((rawLine) => {
        const b = rawLine.trim().replace(/^(?:[-*+•＊]\s+|＞\s*|>\s*)/, '');
        return !!parseLayoutLine(b);
      });
      if (!hasLayout && only.length >= 6) {
        const chunks: string[][] = [];
        for (let k = 0; k < only.length; k += 4) {
          chunks.push(only.slice(k, k + 4));
        }
        blocks.length = 0;
        blocks.push(...chunks);
      }
    }

    for (const block of blocks) {
      const bodies = block.map((rawLine) =>
        rawLine.trim().replace(/^(?:[-*+•＊]\s+|＞\s*|>\s*)/, ''),
      );
      let layoutHint = '';
      for (const b of bodies) {
        const lay = parseLayoutLine(b);
        if (lay) {
          layoutHint = lay;
          break;
        }
      }
      const guessed =
        deriveSlideTitleFromTips(bodies.join('\n'), layoutHint) || '内容要点';
      out.push(`### ${guessed}`);
      for (const rawLine of block) out.push(rawLine);
    }
    hasSlideInChapter = true;
    return end;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (/^#\s+(?!#)/.test(t)) {
      inChapter = false;
      hasSlideInChapter = false;
      out.push(t.startsWith('#') ? t : line);
      continue;
    }
    if (/^##\s+(?!#)/.test(t)) {
      inChapter = true;
      hasSlideInChapter = false;
      out.push(line);
      continue;
    }
    // ### / ### 标题 / ###未命名（trim 后可能无尾空格，不能要求 \s+）
    if (/^###(?!\S)/.test(t) || /^###\s/.test(t)) {
      hasSlideInChapter = true;
      const titlePart = t.replace(/^###\s*/, '').trim();
      const bare = !titlePart || titlePart === '未命名幻灯片';
      if (bare) {
        const tipBuf: string[] = [];
        let layoutHint = '';
        for (let j = i + 1; j < lines.length; j++) {
          const lj = lines[j].trim();
          if (!lj) continue;
          if (/^#{1,6}\s/.test(lj)) break;
          const b = lj.replace(/^(?:[-*+•＊]\s+|＞\s*|>\s*)/, '');
          const lay = parseLayoutLine(b);
          if (lay) layoutHint = lay;
          tipBuf.push(b);
          if (tipBuf.length >= 12) break;
        }
        const guessed =
          deriveSlideTitleFromTips(tipBuf.join('\n'), layoutHint) || '内容要点';
        out.push(`### ${guessed}`);
      } else {
        out.push(`### ${cleanSlideTitle(titlePart) || titlePart}`);
      }
      continue;
    }
    // 仅当章下尚无 ### 时：把「1. 标题」收成幻灯片行（兼容旧写法）
    const numSlide = t.match(/^\d{1,2}[.．、]\s+(.+)$/);
    if (inChapter && !hasSlideInChapter && numSlide?.[1]?.trim()) {
      out.push(`### ${numSlide[1].trim()}`);
      hasSlideInChapter = true;
      continue;
    }
    // 章下漏写 ###：按 layout 块拆成多页（勿整章只补一张）
    if (inChapter && !hasSlideInChapter && t && !/^#{1,6}\s/.test(t)) {
      const body = t.replace(/^(?:[-*+•＊]\s+|＞\s*|>\s*)/, '');
      // 章副标题：绝不当孤儿要点补成幻灯片
      if (/^(?:chapterSub|章副|章副标|章节副标题)\s*[:：]/i.test(body)) {
        out.push(line);
        continue;
      }
      const looksLikeTip =
        /^(?:[-*+•＊]\s+|＞\s*|>\s*)/.test(t) ||
        !!parseLayoutLine(body) ||
        TIP_ROLE_LINE.test(body) ||
        /^(?:col|column|栏|colSub|metric|list)\s*[:：]/i.test(body);
      if (looksLikeTip) {
        i = emitSlidesFromOrphanTips(i);
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n').trim();
}
interface Dictionary<T> {
  [key: string]: T;
}
export interface SlideSelectTemplate {
  id:number;
  name:string,
  pict:string,
  file:string,
  labels:string[],
}

/** 要点标题 4～12 字，描述 20～70 字（按字符计，含中文） */
export const PPT_ITEM_TITLE_MIN = 4;
export const PPT_ITEM_TITLE_MAX = 12;
export const PPT_ITEM_DESC_MIN = 20;
export const PPT_ITEM_DESC_MAX = 70;

/** 数据卡：数字 2～12 字，解读 4～16 字。章节和本页标题里已有的话不要再写进解读。 */
export const PPT_METRIC_TITLE_MIN = 2;
export const PPT_METRIC_TITLE_MAX = 12;
export const PPT_METRIC_DESC_MIN = 4;
export const PPT_METRIC_DESC_MAX = 16;

export type SlideLayout = 'list' | 'metric' | 'metric_list' | 'columns' | 'metric_columns' | 'table' | 'image_grid';

export type TipRole = 'metric' | 'list';
export type OutlineTip = { role: TipRole; text: string };

/** 分栏页的一栏 */
export type ColumnBlock = { title: string; sub: string; items: string[] };

const LAYOUT_LINE =
  /^layout\s*[:：]\s*(metric_columns|metric_list|columns?|metrics?|list|table|image_grid|imagegrid|grid)\s*$/i;
const TIP_ROLE_LINE = /^(metric|list)\s*[:：]\s*(.+)$/i;
const COL_TITLE_LINE = /^(?:col|column|栏)\s*[:：]\s*(.+)$/i;
const COL_SUB_LINE = /^(?:colSub|columnSub|栏副|副标)\s*[:：]\s*(.+)$/i;
const METRIC_SIGNAL = /\d+(?:\.\d+)?\s*[%％]|\d+(?:\.\d+)?\s*亿|\d+(?:\.\d+)?\s*万/u;

export function parseLayoutLine(tip: string): SlideLayout | undefined {
  const m = (tip || "").trim().match(LAYOUT_LINE);
  if (!m) return undefined;
  const v = m[1].toLowerCase().replace(/-/g, '_');
  if (v === 'metric_columns') return 'metric_columns';
  if (v === 'metric_list') return 'metric_list';
  if (v === 'columns' || v === 'column') return 'columns';
  if (v === 'table') return 'table';
  if (v === 'image_grid' || v === 'imagegrid' || v === 'grid') return 'image_grid';
  if (/^metrics?$/.test(v)) return 'metric';
  return 'list';
}

export function countMetricSignals(text: string): number {
  const re = new RegExp(METRIC_SIGNAL.source, 'gu');
  return (text.match(re) || []).length;
}

export function metricTitleOk(title: string): boolean {
  const t = (title || '').trim();
  return t.length >= PPT_METRIC_TITLE_MIN
    && t.length <= PPT_METRIC_TITLE_MAX
    && countMetricSignals(t) > 0;
}

/** 解析单条要点：支持「metric:」「list:」前缀；无前缀时按是否含原数字启发式归类。 */
export function parseTipLine(raw: string): OutlineTip | undefined {
  const t = (raw || '').trim();
  if (!t || parseLayoutLine(t)) return undefined;
  const m = t.match(TIP_ROLE_LINE);
  if (m) {
    return {
      role: m[1].toLowerCase() === 'metric' ? 'metric' : 'list',
      text: m[2].trim(),
    };
  }
  return {
    role: countMetricSignals(t) > 0 ? 'metric' : 'list',
    text: t,
  };
}

export function parseSlideTips(subTitle: string): OutlineTip[] {
  return (subTitle || '')
    .split('\n')
    .map((l) => parseTipLine(l))
    .filter((t): t is OutlineTip => !!t && !!t.text);
}

export function formatTipLine(tip: OutlineTip): string {
  return `${tip.role}: ${tip.text.trim()}`;
}

export function formatSlideTips(tips: OutlineTip[]): string {
  return (tips || [])
    .map((t) => ({ role: t.role, text: (t.text || '').trim() }))
    .filter((t) => t.text)
    .map(formatTipLine)
    .join('\n');
}

export function splitMetricListTips(subTitle: string): { metrics: string[]; lists: string[] } {
  const tips = parseSlideTips(subTitle);
  return {
    metrics: tips.filter((t) => t.role === 'metric').map((t) => t.text),
    lists: tips.filter((t) => t.role === 'list').map((t) => t.text),
  };
}

export {
  expandMetricTipTexts,
  normalizeMetricListSubtitle,
  normalizeMetricListTipsArray,
} from '@/components/DocUtil/outlineMetricNormalize';

import {
  normalizeMetricListSubtitle,
} from '@/components/DocUtil/outlineMetricNormalize';
import {
  normalizeColumnsSubtitle,
} from '@/components/DocUtil/outlineColumnsNormalize';

/**
 * 从大纲要点解析分栏。支持：
 * - `col: 栏标题` / `栏：…` 开新栏
 * - `colSub: 副标` 写在栏标题后
 * - 其余行作为该栏短条目
 */
export function parseColumnBlocks(subTitle: string): ColumnBlock[] {
  const lines = (subTitle || '')
    .split('\n')
    .map((l) => l.replace(/^(?:[-*+•＊]\s+|＞\s*|>\s*)/, '').trim())
    .filter(Boolean)
    .filter((l) => !parseLayoutLine(l));
  const cols: ColumnBlock[] = [];
  let cur: ColumnBlock | null = null;
  for (const line of lines) {
    if (TIP_ROLE_LINE.test(line) && /^metric\s*[:：]/i.test(line)) {
      // metric_columns 上半数字行，跳过
      continue;
    }
    const colM = line.match(COL_TITLE_LINE);
    if (colM) {
      let title = colM[1].trim();
      let sub = '';
      // 兼容「col: 高举高打 | 预算前置拉声量」把副标揉进标题
      const pipe = title.match(/^(.{1,12}?)\s*[|｜]\s*(.+)$/);
      if (pipe) {
        title = pipe[1].trim();
        sub = pipe[2].trim().slice(0, 20);
      }
      cur = { title, sub, items: [] };
      cols.push(cur);
      continue;
    }
    const subM = line.match(COL_SUB_LINE);
    if (subM) {
      if (!cur) {
        cur = { title: '未命名栏', sub: '', items: [] };
        cols.push(cur);
      }
      cur.sub = subM[1].trim();
      continue;
    }
    // list: 前缀剥掉后当短条目
    const listM = line.match(/^list\s*[:：]\s*(.+)$/i);
    const text = (listM ? listM[1] : line).trim();
    if (!text) continue;
    if (!cur) {
      cur = { title: '未命名栏', sub: '', items: [] };
      cols.push(cur);
    }
    cur.items.push(text);
  }
  return cols.filter((c) => c.title || c.items.length > 0);
}

function flatLabelsFromVItem(vItem: Dictionary<string>): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const t = (vItem[`item${i}`] || '').trim();
    const d = (vItem[`item${i}_Desc`] || '').trim();
    if (!t && !d) continue;
    // 分栏优先短标题；无标题用描述
    out.push(t || d);
  }
  return out;
}

/** 无 col: 标记时，把扁平条目均分到若干栏 */
export function chunkItemsToColumns(items: string[], colCount: number): ColumnBlock[] {
  const n = Math.max(2, Math.min(5, colCount || 2));
  const list = (items || []).map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) {
    return Array.from({ length: n }, (_, i) => ({
      title: `栏目${i + 1}`,
      sub: '',
      items: [] as string[],
    }));
  }
  const cols: ColumnBlock[] = Array.from({ length: n }, (_, i) => ({
    title: `栏目${i + 1}`,
    sub: '',
    items: [] as string[],
  }));
  list.forEach((text, idx) => {
    cols[idx % n].items.push(text);
  });
  return cols;
}

/**
 * 下载灌数用：优先大纲 col: 结构，否则用小项均分。
 * @returns colCount 2～5，以及可直接 spread 进 slideVar 的字段
 */
export function buildColumnsFillVars(
  subTitle: string,
  vItem: Dictionary<string>,
  preferredColCount?: number,
): { colCount: number; vars: Dictionary<string | object> } {
  let cols = parseColumnBlocks(subTitle);
  const fromItems = flatLabelsFromVItem(vItem);
  if (cols.length < 2) {
    const n = preferredColCount && preferredColCount >= 2
      ? preferredColCount
      : Math.max(2, Math.min(5, Math.ceil(Math.max(fromItems.length, 4) / 3) || 2));
    cols = chunkItemsToColumns(fromItems.length ? fromItems : parseSlideTips(subTitle).map((t) => t.text), n);
  } else {
    // 有生成小项时：对齐到栏槽位后再灌数（去掉栏标题伪行）
    if (fromItems.length) {
      const asItems = fromItems.map((t) => ({ title: t, content: '' }));
      const aligned = alignItemsToColumnSlots(subTitle, asItems);
      if (aligned.length) {
        cols = cols.map((c, ci) => ({
          ...c,
          items: aligned.filter((a) => a.colIndex === ci).map((a) => a.title).filter(Boolean),
        }));
      } else {
        let idx = 0;
        cols = cols.map((c) => {
          const n = Math.max(2, Math.min(5, c.items.length || 2));
          const items = fromItems.slice(idx, idx + n).filter(Boolean);
          idx += n;
          return {...c, items: items.length ? items : c.items};
        });
      }
    }
  }
  const colCount = Math.max(2, Math.min(5, cols.length || 2));
  const use = cols.slice(0, colCount);
  while (use.length < colCount) {
    use.push({ title: `栏目${use.length + 1}`, sub: '', items: [] });
  }
  const vars: Dictionary<string | object> = {};
  use.forEach((c, i) => {
    const n = i + 1;
    vars[`col${n}Title`] = (c.title || `栏目${n}`).trim();
    vars[`col${n}Sub`] = (c.sub || '').trim();
    const items: Dictionary<string> = {};
    for (let m = 1; m <= 5; m++) {
      items[`item${m}`] = (c.items[m - 1] || '').trim();
    }
    vars[`col${n}`] = items;
  });
  return { colCount, vars };
}

/**
 * metric_columns：上半 vItem 数据卡，下半 columns。
 * 小项前段为数字卡，大纲里 col: 段为分栏；若无 col: 则用非数字小项均分两栏。
 */
export function buildMetricColumnsFillVars(
  subTitle: string,
  vItem: Dictionary<string>,
): { metricCount: number; colCount: number; vars: Dictionary<string | object> } {
  const tips = parseSlideTips(subTitle);
  const metricTips = tips.filter((t) => t.role === 'metric');
  let metricCount = 0;
  const metricVItem: Dictionary<string> = {};

  // 优先用已生成的 vItem 中可识别的数字卡
  for (let i = 1; i <= 5; i++) {
    const t = (vItem[`item${i}`] || '').trim();
    const d = (vItem[`item${i}_Desc`] || '').trim();
    if (t && metricTitleOk(t)) {
      metricCount++;
      metricVItem[`item${metricCount}`] = t;
      metricVItem[`item${metricCount}_Desc`] = d;
    } else {
      break;
    }
  }
  if (metricCount < 2 && metricTips.length >= 2) {
    metricCount = 0;
    for (const tip of metricTips.slice(0, 5)) {
      const parts = tip.text.split(/\s+/);
      const num = parts[0] || tip.text;
      const desc = tip.text.slice(num.length).trim() || tip.text;
      if (!metricTitleOk(num) && countMetricSignals(tip.text) === 0) continue;
      metricCount++;
      const title = metricTitleOk(num) ? num : (tip.text.match(METRIC_SIGNAL)?.[0] || num);
      metricVItem[`item${metricCount}`] = title.slice(0, PPT_METRIC_TITLE_MAX);
      metricVItem[`item${metricCount}_Desc`] = (metricTitleOk(num) ? desc : tip.text)
        .replace(title, '')
        .trim()
        .slice(0, PPT_METRIC_DESC_MAX) || '关键口径';
    }
  }
  metricCount = Math.max(2, Math.min(5, metricCount || 2));
  for (let i = 1; i <= metricCount; i++) {
    if (!metricVItem[`item${i}`]) metricVItem[`item${i}`] = '';
    if (!metricVItem[`item${i}_Desc`]) metricVItem[`item${i}_Desc`] = '';
  }

  // 分栏：去掉 metric 行后再 parse；栏数默认 2，5 卡时可 3
  const colLines = (subTitle || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      const body = l.replace(/^(?:[-*+•＊]\s+)/, '');
      if (parseLayoutLine(body)) return false;
      if (/^metric\s*[:：]/i.test(body)) return false;
      return true;
    })
    .join('\n');
  const preferCols = metricCount >= 5 ? 2 : 2;
  // 非数字小项 → 分栏条目
  const restVItem: Dictionary<string> = {};
  let ri = 0;
  for (let i = metricCount + 1; i <= 12; i++) {
    const t = (vItem[`item${i}`] || '').trim();
    const d = (vItem[`item${i}_Desc`] || '').trim();
    if (!t && !d) continue;
    ri++;
    restVItem[`item${ri}`] = t;
    restVItem[`item${ri}_Desc`] = d;
  }
  let { colCount, vars: colVars } = buildColumnsFillVars(colLines, restVItem, preferCols);
  if (metricCount >= 5 && parseColumnBlocks(colLines).length >= 3) {
    ({ colCount, vars: colVars } = buildColumnsFillVars(colLines, restVItem, 3));
  } else if (metricCount >= 5 && colCount > 2 && parseColumnBlocks(colLines).length < 3) {
    // 模板仅 5+3 或 2～5+2；无 3 栏标记时保持 2 栏
    ({ colCount, vars: colVars } = buildColumnsFillVars(colLines, restVItem, 2));
  }

  return {
    metricCount,
    colCount,
    vars: {
      vItem: metricVItem,
      ...colVars,
    },
  };
}

/**
 * metric_list：上半 vItem 数据卡，下半 vItem2 清单。
 * 模板：37～40 = 2～5 卡 + 2 要点；41 = 5 卡 + 3 要点。
 */
export function buildMetricListFillVars(
  subTitle: string,
  vItem: Dictionary<string>,
): { metricCount: number; listCount: number; vars: Dictionary<string | object> } {
  const { metrics: metricsIn, lists } = splitMetricListTips(subTitle);
  // 一条 tip 里揉了多个原数字时拆开（「586亿、42.3% …」→ 两条）
  const metrics: string[] = [];
  for (const tip of metricsIn) {
    const nums = [...tip.matchAll(/[+\-＋－]?\d[\d.,]*\s*[%％亿万]/gu)].map((m) => m[0].trim());
    if (nums.length >= 2) {
      const rest = tip
        .replace(/[+\-＋－]?\d[\d.,]*\s*[%％亿万]/gu, ' ')
        .replace(/[、,，]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      for (const n of nums) metrics.push(rest ? `${n} ${rest}` : n);
    } else {
      metrics.push(tip);
    }
  }

  let metricCount = 0;
  for (let i = 1; i <= 5; i++) {
    const t = (vItem[`item${i}`] || '').trim();
    if (t && metricTitleOk(t)) metricCount++;
    else break;
  }
  if (metricCount < 2) {
    metricCount = Math.max(2, Math.min(5, metrics.length || 2));
  } else {
    metricCount = Math.max(2, Math.min(5, metricCount));
  }

  // 模板矩阵：默认 2 条 list；仅 5 卡时支持 3 条
  let listCount = 2;
  const wantList = Math.max(
    lists.length,
    Math.max(0, Math.floor(Object.keys(vItem).filter((k) => /^item\d+$/.test(k)).length) - metricCount),
  );
  if (metricCount >= 5 && wantList >= 3) listCount = 3;

  const metricVItem: Dictionary<string> = {};
  for (let i = 1; i <= metricCount; i++) {
    let t = (vItem[`item${i}`] || '').trim();
    let d = (vItem[`item${i}_Desc`] || '').trim();
    if (!t && metrics[i - 1]) {
      const parts = metrics[i - 1].split(/\s+/);
      t = parts[0] || metrics[i - 1];
      d = metrics[i - 1].slice(t.length).trim() || '关键口径';
    }
    metricVItem[`item${i}`] = t.slice(0, PPT_METRIC_TITLE_MAX);
    metricVItem[`item${i}_Desc`] = (d || '关键口径').slice(0, PPT_METRIC_DESC_MAX);
  }

  const listVItem: Dictionary<string> = {};
  for (let i = 1; i <= listCount; i++) {
    const src = metricCount + i;
    let t = (vItem[`item${src}`] || '').trim();
    let d = (vItem[`item${src}_Desc`] || '').trim();
    if (!t && lists[i - 1]) {
      const tip = lists[i - 1];
      const split = tip.match(/^(.+?)[：:]\s*(.+)$/);
      if (split && split[1].trim().length <= 16) {
        t = split[1].trim();
        d = split[2].trim();
      } else {
        // 整句作标题，禁止按 12 字硬切（会把「类目」劈开）
        t = tip.slice(0, 22);
        d = '';
      }
    }
    listVItem[`item${i}`] = t;
    listVItem[`item${i}_Desc`] = d;
  }

  return {
    metricCount,
    listCount,
    vars: { vItem: metricVItem, vItem2: listVItem },
  };
}

const TABLE_ROWS = 5;
const TABLE_COLS = 4;

/**
 * table：5×4 原生表格。要点优先 `|`/`\t` 分行；否则用小项/要点按行主序填格。
 */
export function buildTableFillVars(
  subTitle: string,
  vItem: Dictionary<string>,
): { vars: Dictionary<string> } {
  const tipTexts = parseSlideTips(subTitle).map((t) => t.text);
  let tableTitle = '';
  const pipeRows: string[][] = [];
  for (const tip of tipTexts) {
    const m = tip.match(/^(?:tableTitle|表题|副标)\s*[:：]\s*(.+)$/i);
    if (m) {
      tableTitle = m[1].trim();
      continue;
    }
    if (/[|\t]/.test(tip)) {
      const cells = tip.split(/[|\t]/).map((c) => c.trim());
      while (cells.length < TABLE_COLS) cells.push('');
      pipeRows.push(cells.slice(0, TABLE_COLS));
    }
  }

  const grid: string[][] = Array.from({ length: TABLE_ROWS }, () =>
    Array.from({ length: TABLE_COLS }, () => ''),
  );

  if (pipeRows.length) {
    for (let r = 0; r < Math.min(TABLE_ROWS, pipeRows.length); r++) {
      for (let c = 0; c < TABLE_COLS; c++) {
        grid[r][c] = (pipeRows[r][c] || '').slice(0, 28);
      }
    }
  } else {
    const cells: string[] = [];
    for (let i = 1; i <= TABLE_ROWS * TABLE_COLS; i++) {
      const t = (vItem[`item${i}`] || '').trim();
      const d = (vItem[`item${i}_Desc`] || '').trim();
      if (t) cells.push(d ? `${t} ${d}`.trim() : t);
    }
    if (!cells.length) {
      for (const tip of tipTexts) {
        if (/^(?:tableTitle|表题|副标)\s*[:：]/i.test(tip)) continue;
        if (tip.trim()) cells.push(tip.trim());
      }
    }
    for (let i = 0; i < TABLE_ROWS * TABLE_COLS; i++) {
      const r = Math.floor(i / TABLE_COLS);
      const c = i % TABLE_COLS;
      grid[r][c] = (cells[i] || '').slice(0, 28);
    }
  }

  const vars: Dictionary<string> = { tableTitle: tableTitle.slice(0, 40) };
  for (let r = 0; r < TABLE_ROWS; r++) {
    for (let c = 0; c < TABLE_COLS; c++) {
      vars[`cell_r${r}c${c}`] = grid[r][c];
    }
  }
  return { vars };
}

/** image_grid：2×2 图鉴，cap1～cap4 取前 4 条要点/小项。 */
export function buildImageGridFillVars(
  subTitle: string,
  vItem: Dictionary<string>,
): { vars: Dictionary<string> } {
  const tipTexts = parseSlideTips(subTitle).map((t) => t.text);
  const vars: Dictionary<string> = {};
  for (let i = 1; i <= 4; i++) {
    let t = (vItem[`item${i}`] || '').trim();
    if (!t && tipTexts[i - 1]) t = tipTexts[i - 1];
    vars[`cap${i}`] = t.slice(0, 28);
  }
  return { vars };
}

/**
 * 写作提示里的分栏大纲：按栏分组，勿把 col:/colSub: 当成普通要点扁平编号。
 */
export function formatColumnsOutlineForPrompt(subTitle: string): string {
  const cols = parseColumnBlocks(subTitle);
  if (cols.length < 2) return '';
  const lines = ['【大纲要点·分栏】', '（按栏展开短条目；不要输出 col:/colSub: 原文，不要写成长段落）'];
  cols.forEach((c, i) => {
    const head = (c.sub || '').trim()
      ? `栏${i + 1}「${(c.title || '未命名').trim()}」｜${c.sub.trim()}`
      : `栏${i + 1}「${(c.title || '未命名').trim()}」`;
    lines.push(head);
    for (const item of c.items || []) {
      const t = (item || '').trim();
      if (t) lines.push(`  - ${t}`);
    }
  });
  lines.push('');
  return lines.join('\n');
}

/** 下载时一页大纲展开为几张物理页（metric_list 已有单页模板，计 1）。 */
export function outlineSlideRenderPages(layout: SlideLayout | string | undefined): number {
  return 1;
}

/** 至少两条要点各自带原数字才是数据卡；数字+叙述并存则 metric_list。 */
export function inferSlideLayout(tips: string[]): SlideLayout {
  const rows = (tips || []).map((s) => s.trim()).filter(Boolean);
  const pipeRows = rows.filter((t) => (t.match(/\|/g) || []).length >= 2);
  if (pipeRows.length >= 2) return 'table';
  const parsed = rows.map(parseTipLine).filter((t): t is OutlineTip => !!t);
  const metrics = parsed.filter((t) => t.role === 'metric');
  const lists = parsed.filter((t) => t.role === 'list');
  const hasExplicitRole = rows.some((t) => TIP_ROLE_LINE.test(t));
  if (hasExplicitRole) {
    if (metrics.length >= 2 && lists.length >= 1) return 'metric_list';
    if (metrics.length >= 2 && lists.length === 0 && metrics.length <= 4) return 'metric';
    return 'list';
  }
  if (metrics.length >= 2 && lists.length >= 2) return 'metric_list';
  if (rows.length >= 2 && rows.length <= 4 && metrics.length >= 2 && lists.length === 0) {
    return 'metric';
  }
  return 'list';
}

export function countOutlineTips(subTitle: string): number {
  const cols = parseColumnBlocks(subTitle);
  // 分栏：只计栏内短条目，不计 col:/colSub: 结构行
  if (cols.length >= 2) {
    return cols.reduce((n, c) => n + (c.items || []).filter((t) => (t || '').trim()).length, 0);
  }
  return parseSlideTips(subTitle)
    .filter((t) => !/^(?:col|column|栏|colSub|栏副|副标)\s*[:：]/i.test(t.text))
    .length;
}

/**
 * 把生成小项对齐到分栏槽位：丢掉「栏标题/副标」伪条目，按大纲条目匹配，不足则按序补。
 */
export function alignItemsToColumnSlots(
  subTitle: string,
  items: Array<{ title: string; content: string }>,
): Array<{
  title: string;
  content: string;
  colTitle: string;
  colSub: string;
  colIndex: number;
  itemIndex: number;
  label: string;
}> {
  const cols = parseColumnBlocks(subTitle);
  if (cols.length < 2) return [];
  const colTitles = new Set(cols.map((c) => (c.title || '').trim()).filter(Boolean));
  const colSubs = new Set(cols.map((c) => (c.sub || '').trim()).filter(Boolean));
  const pool = (items || [])
    .map((it) => ({ title: (it.title || '').trim(), content: (it.content || '').trim() }))
    .filter((it) => {
      if (!it.title) return false;
      // 标题等于栏名，且描述像副标或为空 → 伪条目
      if (colTitles.has(it.title)) return false;
      if (colSubs.has(it.title)) return false;
      return true;
    });

  const out: Array<{
    title: string;
    content: string;
    colTitle: string;
    colSub: string;
    colIndex: number;
    itemIndex: number;
    label: string;
  }> = [];

  for (let ci = 0; ci < cols.length; ci++) {
    const col = cols[ci];
    const wanted = (col.items || []).map((t) => t.trim()).filter(Boolean);
    const n = Math.max(1, wanted.length || 2);
    for (let ii = 0; ii < n; ii++) {
      const want = wanted[ii] || '';
      let hit = -1;
      if (want) {
        hit = pool.findIndex(
          (it) => it.title === want || it.title.includes(want) || want.includes(it.title),
        );
      }
      if (hit < 0 && pool.length) hit = 0;
      const picked =
        hit >= 0
          ? pool.splice(hit, 1)[0]
          : { title: want, content: '' };
      const colTitle = (col.title || `栏${ci + 1}`).trim();
      out.push({
        title: picked.title || want,
        content: picked.content,
        colTitle,
        colSub: (col.sub || '').trim(),
        colIndex: ci,
        itemIndex: ii,
        label: `${colTitle} · 条目${ii + 1}`,
      });
    }
  }
  return out;
}

/** 单行格式示例。传入大纲条数时，明确禁止增删或拆条。 */
export function buildPptItemFormatPrompt(
  count?: number,
  layout: SlideLayout = 'list',
  parts?: { metric: number; list: number },
): string {
  if (layout === 'metric_list') {
    const m = parts?.metric && parts.metric > 0 ? parts.metric : 0;
    const l = parts?.list && parts.list > 0 ? parts.list : 0;
    const total = m + l;
    const countLine = total
      ? `本页是「数据卡+要点」复合页。必须且只能输出 ${total} 行，编号严格为 1 到 ${total}：前 ${m} 行为数据卡，后 ${l} 行为列表要点。禁止多写或少写。\n`
      : '本页是「数据卡+要点」复合页。先输出 2～4 行数据卡，再输出 2～4 行列表要点，条数与【大纲要点】中 metric/list 分组一致。\n';
    return (
      '\n\n【输出格式】\n' +
      countLine +
      '必须逐行输出，每行一条；不要用方括号，不要前言后语，不要整页拒绝。\n' +
      `数据卡行（前 ${m || '若干'} 行）：每行只写【一个】原数字（${PPT_METRIC_TITLE_MIN}～${PPT_METRIC_TITLE_MAX}字，须含百分号、亿或万），横线后短口径（${PPT_METRIC_DESC_MIN}～${PPT_METRIC_DESC_MAX}字）。禁止「586亿、42.3%」写在同一行；禁止类目名当数据卡。\n` +
      `列表要点行（后 ${l || '若干'} 行）：一句短判断（4～22字）；横线后可写互补补充（≤22字），不得与标题重复，禁止把同一句从中间砍成「标题+描述」。\n` +
      '错误：1. 羽绒服、牛仔裤、马甲等类 - 目增速超过大盘\n' +
      '正确：1. 586亿 - 2024H1男装大盘销售额\n' +
      '正确：2. +42.3% - 同比增速\n' +
      '正确：3. 增速超大盘 - 羽绒/牛仔/马甲领涨\n' +
      '【当前章节】和【本页标题】里已经出现的话不要写进数据卡解读。禁止换算或编造数字。\n'
    );
  }
  if (layout === 'metric') {
    const n = count && count > 0 ? count : 0;
    const countLine = n
      ? `本页必须且只能输出 ${n} 行，编号严格为 1 到 ${n}。禁止多写或少写。一条大纲要点只对应 1 行。\n`
      : '输出 2～5 行，条数与【大纲要点】一致，禁止增删。\n';
    return (
      '\n\n【输出格式】\n' +
      '本页是数据卡。\n' +
      countLine +
      '必须逐行输出，每行一条；不要用方括号，不要前言后语，不要整页拒绝。\n' +
      `每行以检索结果中的原数字开头（${PPT_METRIC_TITLE_MIN}～${PPT_METRIC_TITLE_MAX}字，须含百分号、亿或万），横线后只用该数字旁边的名称说明它指什么（${PPT_METRIC_DESC_MIN}～${PPT_METRIC_DESC_MAX}字）。\n` +
      '【当前章节】和【本页标题】里已经出现的话不要再写进解读。解读只留数字旁边的名称，例如「某某的占比」，不要再写标题里已有的年份、品类和「增长趋势」。\n' +
      '百分数和名称可以分成相邻短句，不必和大纲要点连成同一句。大纲用词与检索不一致时，以检索用词为准。\n' +
      '禁止换算，禁止编造检索里没有的比例、金额或天数。禁止输出「知识库未提供」「知识库中未提供」「无法据此」。\n' +
      '1. 原数字 - 这个数字指什么\n'
    );
  }
  if (layout === 'columns') {
    const n = count && count > 0 ? count : 0;
    const countLine = n
      ? `必须且只能输出 ${n} 行，编号 1 到 ${n}，与大纲「- 短条目」一一对应（不要输出栏标题/副标行）。\n`
      : '输出与大纲短条目条数一致的行，禁止增删。\n';
    return (
      '\n\n【输出格式】\n' +
      '本页是分栏页。栏标题与副标只是分组标签，禁止写成编号行。\n' +
      countLine +
      '每行只写一条短词/短句（宜 4～16 字）；横线后可写极短补充（≤16 字）或留空。\n' +
      '错误示例：把「学生党」「预算敏感追潮流」也编成 1. 2. 行。\n' +
      '正确：只输出「街头宽松」「低客单套装」这类栏内短条目。\n' +
      '1. 短条目 - 可选补充\n'
    );
  }
  if (layout === 'metric_columns') {
    const m = parts?.metric && parts.metric > 0 ? parts.metric : 0;
    const l = parts?.list && parts.list > 0 ? parts.list : 0;
    const total = m + l;
    const countLine = total
      ? `必须且只能输出 ${total} 行：前 ${m} 行为数据卡，后 ${l} 行为分栏短条目。\n`
      : '先输出 2～5 行数据卡，再输出分栏短条目，条数与大纲一致。\n';
    return (
      '\n\n【输出格式】\n' +
      '本页是「上数据卡 + 下分栏」。\n' +
      countLine +
      '数据卡行：原数字 - 短口径（4～16 字）。\n' +
      '分栏行：短词/短句（4～16 字） - 可选极短补充。\n' +
      '1. 原数字 - 这个数字指什么\n'
    );
  }
  if (layout === 'table') {
    const n = count && count > 0 ? count : 0;
    const countLine = n
      ? `必须且只能输出 ${n} 行，编号 1 到 ${n}，与大纲表格行一一对应。\n`
      : '输出与大纲表格行数一致的行，禁止增删。\n';
    return (
      '\n\n【输出格式】\n' +
      '本页是表格页（最多 5 行 × 4 列）。\n' +
      countLine +
      '每行用竖线分隔单元格，例如：维度|金额|增速|口径\n' +
      '单元格宜短（≤12 字）；数字须来自检索原文，禁止编造。\n' +
      '1. 维度|数值|增速|说明\n'
    );
  }
  if (layout === 'image_grid') {
    const n = count && count > 0 ? Math.min(4, count) : 4;
    return (
      '\n\n【输出格式】\n' +
      `本页是 2×2 图鉴，必须且只能输出 ${n} 行图注（编号 1 到 ${n}）。\n` +
      '每行一句短图注（4～16 字），对应一格图片说明；禁止长段落。\n' +
      '1. 短图注\n'
    );
  }
  const n = count && count > 0 ? count : 0;
  const countLine = n
    ? `本页必须且只能输出 ${n} 行，编号严格为 1 到 ${n}。禁止多写或少写。一条大纲要点只对应 1 行，即使其中列举了多个名称，也不要拆成多行。\n`
    : '条数必须与【大纲要点】一致，禁止增删，禁止把一条大纲拆成多行。\n';
  return (
    '\n\n【输出格式】\n' +
    countLine +
    '必须逐行输出，每行一条；不要用方括号，不要前言后语。下面只示范一行写法，不要照抄成多条：\n' +
    `1. 概括标题（${PPT_ITEM_TITLE_MIN}～${PPT_ITEM_TITLE_MAX}字） - 具体描述（${PPT_ITEM_DESC_MIN}～${PPT_ITEM_DESC_MAX}字）\n` +
    '各点描述必须互不雷同：每条描述只服务该行标题（对应一条大纲要点），禁止把同一段品牌背景/案例故事粘到多个小点后面。\n'
  );
}

export const PPT_ITEM_FORMAT_PROMPT = buildPptItemFormatPrompt();

export function validateSlideViewItems(
  items: Array<{ title: string; content: string }>,
  layout: SlideLayout = 'list',
  opts?: { metricCount?: number },
): string | null {
  const rows = (items || []).map((it) => ({
    title: (it.title || '').trim(),
    content: (it.content || '').trim(),
  })).filter((it) => it.title || it.content);
  if (rows.length === 0) {
    return '请至少填写 1 条完整小项（概括标题 + 具体描述）。';
  }
  if (layout === 'metric' && (rows.length < 2 || rows.length > 5)) {
    return `数据卡须为 2～5 条（当前 ${rows.length} 条）。`;
  }
  if (layout === 'columns') {
    for (let i = 0; i < rows.length; i++) {
      const { title, content } = rows[i];
      if (!title) return `第 ${i + 1} 条需要短条目文字。`;
      if (title.length > 28) return `第 ${i + 1} 条过长（宜 ≤16 字，当前 ${title.length} 字）。`;
      if (content && content.length > 28) {
        return `第 ${i + 1} 条补充过长（宜省略或 ≤16 字）。`;
      }
    }
    return null;
  }
  if (layout === 'metric_columns') {
    const mCount = opts?.metricCount ?? 0;
    if (mCount < 2 || mCount > 5) {
      return `上半数据卡须为 2～5 条（当前 ${mCount} 条）。`;
    }
    for (let i = 0; i < rows.length; i++) {
      const { title, content } = rows[i];
      const asMetric = i < mCount;
      if (!title) return `第 ${i + 1} 点需要填写。`;
      if (asMetric) {
        if (!metricTitleOk(title)) {
          return `第 ${i + 1} 点须是原数字（含百分号、亿或万）。`;
        }
        if (content.length < PPT_METRIC_DESC_MIN || content.length > PPT_METRIC_DESC_MAX) {
          return `第 ${i + 1} 点短口径须为 ${PPT_METRIC_DESC_MIN}～${PPT_METRIC_DESC_MAX} 字。`;
        }
      } else if (title.length > 28) {
        return `第 ${i + 1} 条分栏条目过长。`;
      }
    }
    return null;
  }
  if (layout === 'metric_list') {
    const mCount = opts?.metricCount ?? 0;
    if (mCount < 2 || mCount > 5) {
      return `数据卡+要点页的数据卡部分须为 2～5 条（当前 ${mCount} 条）。`;
    }
    const listCount = rows.length - mCount;
    if (listCount < 2 || listCount > 3) {
      return `数据卡+要点页的列表部分须为 2～3 条（当前 ${listCount} 条；3 条仅 5 卡模板支持）。`;
    }
    for (let i = 0; i < rows.length; i++) {
      const { title, content } = rows[i];
      const asMetric = i < mCount;
      if (!title) return `第 ${i + 1} 点需要填写。`;
      if (asMetric) {
        const nums = title.match(/[+\-＋－]?\d[\d.,]*\s*[%％亿万]/gu) || [];
        if (nums.length > 1) {
          return `第 ${i + 1} 点勿把多个数字揉在一行（如「586亿、42.3%」应拆成两行）。`;
        }
        if (!metricTitleOk(title)) {
          return `第 ${i + 1} 点须是原数字（含百分号、亿或万），不要写类目名。`;
        }
        if (content.length < PPT_METRIC_DESC_MIN || content.length > PPT_METRIC_DESC_MAX) {
          return `第 ${i + 1} 点短口径须为 ${PPT_METRIC_DESC_MIN}～${PPT_METRIC_DESC_MAX} 字。`;
        }
      } else {
        if (title.length < 2 || title.length > 22) {
          return `第 ${i + 1} 点判断标题宜 2～22 字（当前 ${title.length}）。`;
        }
        if (content && content.length > 22) {
          return `第 ${i + 1} 点补充宜 ≤22 字，且勿与标题重复。`;
        }
        if (content && (title.includes(content) || content.includes(title))) {
          return `第 ${i + 1} 点标题与补充不要重复同一句。`;
        }
      }
    }
    return null;
  }
  if (layout === 'table' || layout === 'image_grid') {
    for (let i = 0; i < rows.length; i++) {
      const { title } = rows[i];
      if (!title) return `第 ${i + 1} 条需要填写。`;
      if (title.length > 40) return `第 ${i + 1} 条过长（宜 ≤28 字）。`;
    }
    return null;
  }
  for (let i = 0; i < rows.length; i++) {
    const n = i + 1;
    const { title, content } = rows[i];
    if (!title || !content) {
      return `第 ${n} 点的标题和描述都要填写。`;
    }
    const asMetric = layout === 'metric';
    if (asMetric) {
      if (!metricTitleOk(title)) {
        return `第 ${n} 点须是检索中的原数字（${PPT_METRIC_TITLE_MIN}～${PPT_METRIC_TITLE_MAX} 字，含百分号、亿或万，当前「${title}」）。`;
      }
      if (content.length < PPT_METRIC_DESC_MIN || content.length > PPT_METRIC_DESC_MAX) {
        return `第 ${n} 点解读须为 ${PPT_METRIC_DESC_MIN}～${PPT_METRIC_DESC_MAX} 字（当前 ${content.length} 字）。`;
      }
      continue;
    }
    if (title.length < PPT_ITEM_TITLE_MIN || title.length > PPT_ITEM_TITLE_MAX) {
      return `第 ${n} 点标题须为 ${PPT_ITEM_TITLE_MIN}～${PPT_ITEM_TITLE_MAX} 字（当前 ${title.length} 字）。`;
    }
    if (content.length < PPT_ITEM_DESC_MIN || content.length > PPT_ITEM_DESC_MAX) {
      return `第 ${n} 点描述须为 ${PPT_ITEM_DESC_MIN}～${PPT_ITEM_DESC_MAX} 字（当前 ${content.length} 字）。`;
    }
  }
  // list：禁止多点粘贴同一段品牌故事当 Desc
  if (layout === 'list') {
    const norm = (s: string) => s.replace(/\s+/g, '').slice(0, 80);
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = norm(rows[i].content);
        const b = norm(rows[j].content);
        if (a.length >= 16 && a === b) {
          return `第 ${i + 1} 点与第 ${j + 1} 点描述完全相同；每点须写本条标题专属事实，禁止整段复用`;
        }
      }
    }
  }
  return null;
}

export class ViewItem4Ppt {
    index:number;
    title:string;
    content:string;
    image:string="";

    constructor(index:number, title:string,content:string){
        this.index = index;
        this.title = title;
        this.content = content;
    }

    /**
     * 根据文本产生观点及其具体描述内容。
     * 兼容多种常见模型输出格式；解析失败返回 undefined。
     */
    static genViewItemByRegex(viewStr: string) {
        if (!viewStr || !String(viewStr).trim()) return undefined;
        let text = String(viewStr).replace(/\r\n/g, '\n').trim();
        // 去掉围栏与常见套话残留
        text = text.replace(/^```[\w]*\n?/, '').replace(/\n?```\s*$/, '').trim();
        const viewItems = new Array<ViewItem4Ppt>();

        const cleanPart = (s: string) =>
            s
                .replace(/\s*\[\d+\]\s*/g, '')
                .replace(/^\*+|\*+$/g, '')
                .replace(/^\[|\]$/g, '')
                .replace(/[。．]\s*$/u, '')
                .trim();

        const looksMetricTitle = (t: string) =>
            /[\d]+(?:\.\d+)?\s*[%％]/.test(t) ||
            /[\d]+(?:\.\d+)?\s*[亿万]/.test(t) ||
            /^[+\-＋－]?\d/.test(t);

        const pushItem = (titleRaw: string, contentRaw: string, allowEmptyContent = false) => {
            const title = cleanPart(titleRaw);
            let content = cleanPart(contentRaw);
            if (!title) return;
            if (!content && allowEmptyContent) {
                content = looksMetricTitle(title) ? '关键口径' : '要点说明';
            }
            if (title && content) {
                viewItems.push(new ViewItem4Ppt(viewItems.length + 1, title, content));
            }
        };

        // 标题与描述之间的分隔符：- / -- / — / —— / – / －（全角）
        const SEP = '(?:-{1,2}|—{1,2}|–+|－+)';
        const SEP_OR_COLON = `(?:${SEP}|[:：])`;

        const tryMatchLine = (line: string): boolean => {
            // 1. 概括 - 描述 / 1、概括 —— 描述 / 1. 概括 -- 描述
            let m =
                line.match(new RegExp(`^\\d{1,2}\\s*[\\.．、]\\s*(.+?)\\s*${SEP}\\s*(.+)$`, 'u')) ||
                // 1. 概括：描述 / 1. 概括: 描述
                line.match(/^\d{1,2}\s*[\.．、]\s*(.+?)\s*[:：]\s*(.+)$/u) ||
                // 1. [概括]-[描述] / 1. [概括]——[描述]
                line.match(new RegExp(`^\\d{1,2}\\s*[\\.．、]\\s*\\[(.+?)\\]\\s*${SEP}\\s*\\[(.+?)\\]`, 'u')) ||
                // 1. **概括** - 描述
                line.match(new RegExp(`^\\d{1,2}\\s*[\\.．、]\\s*\\*\\*(.+?)\\*\\*\\s*${SEP_OR_COLON}\\s*(.+)$`, 'u')) ||
                // - 概括：描述 / * 概括 —— 描述
                line.match(new RegExp(`^[-*•]\\s*(.+?)\\s*${SEP_OR_COLON}\\s*(.+)$`, 'u')) ||
                // 第1点：概括 - 描述
                line.match(new RegExp(`^第\\s*\\d{1,2}\\s*[点项条]\\s*[:：.．、]?\\s*(.+?)\\s*${SEP_OR_COLON}\\s*(.+)$`, 'u')) ||
                // 一、概括。描述 / （1）概括：描述
                line.match(/^[一二三四五六七八九十]+[、.．]\s*(.+?)[。．:：]\s*(.+)$/u) ||
                line.match(new RegExp(`^[（(]\\s*\\d{1,2}\\s*[)）]\\s*(.+?)\\s*${SEP_OR_COLON}\\s*(.+)$`, 'u')) ||
                // 1）概括 - 描述（无开括号）
                line.match(new RegExp(`^\\d{1,2}\\s*[)）]\\s*(.+?)\\s*${SEP_OR_COLON}\\s*(.+)$`, 'u'));
            if (m) {
                pushItem(m[1], m[2], true);
                return true;
            }
            // 数据卡常见：1. 586亿 上半年销售额（空格分隔，无横线）
            const metricSpace = line.match(
                /^(\d{1,2})\s*[\.．、]\s*([+\-＋－]?\d[\d.,]*\s*[%％亿万]?)\s+(.+)$/u,
            );
            if (metricSpace) {
                pushItem(metricSpace[2], metricSpace[3], true);
                return true;
            }
            return false;
        };

        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        let pendingTitle: string | null = null;
        const hasInlineSep = new RegExp(`(?:-{1,2}|—{1,2}|–+|－+|[:：])`);

        for (const line of lines) {
            if (tryMatchLine(line)) {
                pendingTitle = null;
                continue;
            }
            // 多行：编号后仅标题，下一行是描述
            const titleOnly = line.match(
                /^(?:\d{1,2}\s*[\.．、)）]|第\s*\d{1,2}\s*[点项条]\s*[:：.．、]?|[-*•])\s*(.+)$/u,
            );
            if (titleOnly && !hasInlineSep.test(titleOnly[1])) {
                if (pendingTitle) pushItem(pendingTitle, '', true);
                pendingTitle = titleOnly[1];
                continue;
            }
            if (pendingTitle && !/^\d{1,2}\s*[\.．、)）]/.test(line) && !/^第\s*\d/.test(line)) {
                pushItem(pendingTitle, line, true);
                pendingTitle = null;
            }
        }
        // 收尾：仅有标题无描述的编号行（数据卡常见）
        if (pendingTitle) {
            pushItem(pendingTitle, '', true);
            pendingTitle = null;
        }

        // 兼容旧正则（历史上部分模型输出）
        if (viewItems.length === 0) {
            try {
                const regexp =
                    /(?<=\d[.] (.*)[\n|\s]*(?=(?:-[\n|\s]*(.*)[。｜\n])))/g;
                const itemArray = [...text.matchAll(regexp)].map((x) => x.slice(1));
                itemArray.forEach((item) => {
                    if (item.length >= 2) pushItem(item[0], item[1], true);
                });
            } catch {
                // ignore
            }
        }

        // 不再从整段叙述里「捞数字拼口径」——易错位，应由大纲 tips + 规范编号行保证

        return viewItems.length > 0 ? viewItems : undefined;
    }
}
export class Slide{
  index:number;
  title:string;
  subTitle:string="";
  /** 由大纲要点判定：列表 / 数据卡 / 数据卡+要点。渲染时数字不合格会退回列表。 */
  layout: SlideLayout = 'list';
  // key:number;  //used by Collapse  ,it's key==slide's index
  key:string;
  label:string; //used by Collapse ,it's label==slide's title
  prompt:string="";
  content:string="";
  /** 本页生成失败且没有正文时的原因；有正文但解析失败不走这里 */
  genError:string="";
  viewItems:Array<ViewItem4Ppt>=new Array<ViewItem4Ppt>();

  constructor(index:number, title:string,subTitle?:string) {
    this.index = index;
    this.title = title;
    this.subTitle = subTitle?subTitle:"";
    // this.key = index-1;
    this.key = "slide"+index;
    this.label= title;
  }
  setPrompt(prompt:string){
    this.prompt = prompt;
  }

  /**
   * 单纯设置观点数组
   * @param viewItems
   */
  setResult(viewItems:Array<ViewItem4Ppt>){
    this.viewItems = viewItems;
  }

  /**
   * 将幻灯片的观点数组组合成内容返回。
   * 若数组无值，返回空子串
   * 若数组有值，返回组合内容。
   */
  getContent(){
    if(this.viewItems.length===0){
      return "";
    }else{
      let content=""
      this.viewItems.forEach((item,index)=>{
        content+=`第${index+1}点:${item.title} - ${item.content} `;
      })
      return content;
    }
  }

  /** 结构化小项导出为可再解析的文本（与提示词格式一致） */
  static itemsToContentText(items: Array<{ title: string; content: string }>) {
    return items
      .map((it, i) => `${i + 1}. ${(it.title || '').trim()} - ${(it.content || '').trim()}`)
      .filter((line) => !/^\d+\.\s*-\s*$/.test(line))
      .join('\n');
  }

  /**
   * 直接写入结构化小项（跳过正则）。校验：至少 1 条，且每条标题+描述非空。
   */
  setViewItemsStructured(items: Array<{ title: string; content: string }>) {
    const cleaned = (items || [])
      .map((it) => ({
        title: (it.title || '').trim(),
        content: (it.content || '').trim(),
      }))
      .filter((it) => {
        if (this.layout === 'columns' || this.layout === 'metric_columns') return !!it.title;
        return !!(it.title && it.content);
      });
    if (cleaned.length === 0) {
      return false;
    }
    if (validateSlideViewItems(cleaned, this.layout, {
      metricCount:
        this.layout === 'metric_list' || this.layout === 'metric_columns'
          ? splitMetricListTips(this.subTitle || '').metrics.length
          : undefined,
    })) {
      return false;
    }
    const viewItems = cleaned.map(
      (it, i) => new ViewItem4Ppt(i + 1, it.title, it.content),
    );
    this.setResult(viewItems);
    this.content = Slide.itemsToContentText(cleaned);
    return true;
  }

  /**
   * 为幻灯片分析字符串并设置其观点列表
   * 首先是原始内容保存。
   * 若内容不合格，无法设置观点数组，返回false
   * 若内容合格，设置观点数组，返回true
   * @param content
   */
  setContent(content:string){
    this.content=content;
    this.genError="";
    let viewItems=ViewItem4Ppt.genViewItemByRegex(content) || [];
    // 分栏：丢掉栏标题伪行，按大纲槽位对齐后再展示/灌数
    if ((this.layout === 'columns' || this.layout === 'metric_columns') && viewItems.length) {
      const aligned = alignItemsToColumnSlots(
        this.subTitle || '',
        viewItems.map((vi) => ({ title: vi.title, content: vi.content })),
      );
      if (aligned.length) {
        viewItems = aligned.map(
          (it, i) => new ViewItem4Ppt(i + 1, it.title, it.content),
        );
        this.content = Slide.itemsToContentText(
          aligned.map((it) => ({ title: it.title, content: it.content })),
        );
      }
    }
    if(!viewItems||viewItems.length===0){
      return false
    }
    this.setResult(viewItems);
    return true
  }
}

export class Chapter {
  index: number;
  title: string;
  subTitle: string = ""; //大部分没用，预留
  // key: number;  //used by Collapse  ,it's key==slide's index
  key:string;
  label: string; //used by Collapse ,it's label==slide's title
  prompt: string = ""; //大部分没用，预留
  slides: Array<Slide> = new Array<Slide>();

  constructor(index: number, title: string) {
    this.index = index;
    this.title = title;
    // this.key = index-1;
    this.key = "chapter"+index;
    this.label = title;
  }
}

export class SlideVar{
  chapterIndex:number;
  chapterTitle:string;
  slideIndex:number;
  slideGlobalIndex:number;
  slideTitle:string;
  slideSubtitle:string;
  vItem:Dictionary<string>;

  constructor(chapterIndex:number, chapterTitle:string ,
              slideIndex:number, slideGlobalIndex:number,
              slideTitle:string,slideSubtitle:string,vItem:Dictionary<string>
   ) {
    this.chapterIndex = chapterIndex;
    this.chapterTitle = chapterTitle;
    this.slideIndex = slideIndex;
    this.slideGlobalIndex = slideGlobalIndex;
    this.slideTitle = slideTitle;
    this.slideSubtitle = slideSubtitle;
    this.vItem=vItem;
  }

}

export class Ppt{
  title:string;
  chapters:Array<Chapter>;

  constructor(title:string){
    this.title=title;
    this.chapters=new Array<Chapter>();
  }

  setChapters(chapters:Array<Chapter>){
    this.chapters=chapters;
  }

  getChapterTitles(){
    const chapterTitles=new Array<string>();
    if (this.chapters.length===0) return undefined;
    for(let chapter of this.chapters){
      chapterTitles.push(chapter.title);
    }
  }

  /**
   * 获取所有的幻灯片变量，以便于根据模板生成ppt内容。
   */
  static getSlideVars(chapters:Array<Chapter>){
    let slideVars=new Array<SlideVar>();
    let slideIndexG=1
    for(let chapter of chapters){
      if(!chapter.slides||chapter.slides.length===0) return undefined;
      for(let slide of chapter.slides){
        let vItem:Dictionary<string>={};
        for (let vi of slide.viewItems){
          const idx=slide.viewItems.indexOf(vi);
          vItem[`item${idx+1}`]=vi.title;
          vItem[`item${idx+1}_Desc`]=vi.content;
        }
        const slideVar=new SlideVar(chapter.index, stripChapterOrdinalPrefix(chapter.title),
          slide.index,slideIndexG,slide.title,slide.subTitle,vItem);
        slideIndexG++;
        slideVars.push(slideVar);
      }
    }
    return slideVars;
  }

  /**
   * 从生成的内容中获取PPT标题（仅一级标题 `# `，不含 `##`）
   * @param msg
   */
  static getTitleFromMsg(msg:string){
    const s = (msg || "").replace(/^\uFEFF/, "").trim();
    const m = s.match(/^#\s+(?!#)(.+?)(?:\r?\n|$)/);
    if (m) return m[1].trim();
    // 容错：正文中间的第一个一级标题
    const m2 = s.match(/^#\s+(?!#)(.+)$/m);
    return m2 ? m2[1].trim() : "";
  }

  /**
   * 去掉文首一级标题，保留章节。禁止用 "# "+title 做全局替换：
   * 标题解析失败时会把首个「## 章节」误改成「# 章节」，树里少一章。
   */
  static getContentFromMsg=(msg:string)=>{
    const s = (msg || "").replace(/^\uFEFF/, "").trim();
    const stripped = s.replace(/^#\s+(?!#).*(?:\r?\n+|$)/, "").trim();
    if (stripped !== s.trim()) return stripped;
    // 一级标题不在首行时：删掉第一个 # 行
    return s.replace(/^#\s+(?!#).+$/m, "").replace(/^\s*\n/, "").trim();
  }

  static getChaptersFromContent(content:string){
    content = normalizePptOutlineMarkdown(content || '');
    const chapters: Chapter[] = [];
    let currentChapter: Chapter | null = null;

    // 使用正则表达式匹配章节标题、幻灯片标题和副标题/要点
    const chapterRegex = /^##\s+(.+)$/;
    const slideRegex1 = /^###\s+(.+)$/;
    // 仅匹配「1. 标题」这类编号幻灯片，避免把「2024年…」误判为幻灯片
    const slideRegex2 = /^\d{1,2}[.．、]\s+(.+)$/;
    // 大纲要点：- / * / + / • / ＊，或 markdown 斜体整行 *…*
    const subtitleRegex = /^(?:[-*+•＊]\s+|＞\s*|>\s*)(.+)$/;
    const italicLineRegex = /^\*(.+)\*$/;
    /** 大纲中显式写了 layout 行的幻灯片，finalize 时不再推断覆盖 */
    const explicitLayout = new WeakSet<Slide>();
    let chapterIndex = 1;
    let slideIndex = 1;

    const ensureSlide = () => {
      if (!currentChapter) return null;
      if (currentChapter.slides.length > 0) {
        return currentChapter.slides[currentChapter.slides.length - 1];
      }
      const slide = new Slide(slideIndex, '内容要点', '');
      slideIndex++;
      currentChapter.slides.push(slide);
      return slide;
    };

    const pushChapterIfHasSlides = () => {
      if (currentChapter && currentChapter.slides.length > 0) {
        chapters.push(currentChapter);
      }
    };

    const appendSlideTip = (slide: Slide, tipRaw: string) => {
      const tip = tipRaw.replace(/\s*\[\d+\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
      if (!tip) return;
      const explicit = parseLayoutLine(tip);
      if (explicit) {
        slide.layout = explicit;
        explicitLayout.add(slide);
        return;
      }
      // 保留 col: / colSub: 原文，便于分栏解析
      if (/^(?:col|column|栏|colSub|栏副|副标)\s*[:：]/i.test(tip)) {
        if (!slide.subTitle) slide.subTitle = tip;
        else if (!slide.subTitle.includes(tip)) slide.subTitle += '\n' + tip;
        return;
      }
      const parsed = parseTipLine(tip);
      if (!parsed) return;
      const store =
        slide.layout === 'metric_list' ||
        slide.layout === 'metric_columns' ||
        TIP_ROLE_LINE.test(tip)
          ? formatTipLine(parsed)
          : parsed.text;
      if (!slide.subTitle) {
        slide.subTitle = store;
      } else if (!slide.subTitle.includes(store)) {
        slide.subTitle += '\n' + store;
      }
    };

    const finalizeSlide = (slide: Slide | undefined) => {
      if (!slide) return;
      if (!explicitLayout.has(slide)) {
        const tips = (slide.subTitle || '').split('\n').map((s) => s.trim()).filter(Boolean);
        slide.layout = inferSlideLayout(tips);
      }
      const title = (slide.title || '').trim();
      if (!title || title === '未命名幻灯片' || title === '内容要点') {
        const guessed = deriveSlideTitleFromTips(slide.subTitle || '', slide.layout);
        if (guessed) {
          slide.title = guessed;
          slide.label = guessed;
        } else if (!title || title === '未命名幻灯片') {
          slide.title = '内容要点';
          slide.label = '内容要点';
        }
      }
    };

    // 按行分割markdown文本
    const lines = content.split('\n');
    for (const line of lines) {
      const raw = line.trim();
      if (!raw) continue;

      const chapterMatch = raw.match(chapterRegex);
      const slideMatch1 = raw.match(slideRegex1);
      const slideMatch2 = raw.match(slideRegex2);
      const subtitleMatch = raw.match(subtitleRegex) || raw.match(italicLineRegex);

      if (chapterMatch) {
        if (currentChapter && currentChapter.slides.length > 0) {
          finalizeSlide(currentChapter.slides[currentChapter.slides.length - 1]);
        }
        pushChapterIfHasSlides();
        currentChapter = new Chapter(chapterIndex, stripChapterOrdinalPrefix(chapterMatch[1].trim()));
        chapterIndex++;
      } else if ((slideMatch1 || slideMatch2) && currentChapter) {
        let slideTitle = cleanSlideTitle(slideMatch1?.[1] || slideMatch2?.[1] || "");
        // 误写成 ### chapterSub: … 时，收成章副标题，不当幻灯片
        const asChapterSub = slideTitle.match(
          /^(?:chapterSub|章副|章副标|章节副标题)\s*[:：]\s*(.+)$/i,
        );
        if (asChapterSub) {
          const sub = asChapterSub[1].trim();
          if (sub) currentChapter.subTitle = sub.slice(0, 24);
          continue;
        }
        // 兼容 ### 标题：副标题 / ### 标题 - 副标题（同一行）
        let inlineSub = "";
        const inlineSplit = slideTitle.match(/^(.+?)[：:\-—–]\s*(.+)$/);
        if (inlineSplit && inlineSplit[2].length >= 8) {
          slideTitle = cleanSlideTitle(inlineSplit[1]);
          inlineSub = inlineSplit[2].trim();
        }
        if (!slideTitle || slideTitle === '未命名幻灯片') slideTitle = '内容要点';
        const slide = new Slide(slideIndex, slideTitle, "");
        slide.label = slideTitle;
        if (currentChapter.slides.length > 0) {
          finalizeSlide(currentChapter.slides[currentChapter.slides.length - 1]);
        }
        if (inlineSub) {
          appendSlideTip(slide, inlineSub);
        }
        slideIndex++;
        currentChapter.slides.push(slide);
      } else if (currentChapter) {
        // 跳过一级标题残留；章下若漏写 ###，补一张幻灯片再挂要点
        if (/^#\s+/.test(raw)) continue;
        // 章副标题：挂在章上，不进入幻灯片要点（不论是否已有页）
        const tipBody = subtitleMatch?.[1]?.trim() || (!/^#{1,6}\s/.test(raw) ? raw : "");
        const chapterSubMatch = tipBody.match(
          /^(?:chapterSub|章副|章副标|章节副标题)\s*[:：]\s*(.+)$/i,
        );
        if (chapterSubMatch) {
          const sub = chapterSubMatch[1].trim();
          if (sub) currentChapter.subTitle = sub.slice(0, 24);
          continue;
        }
        const lastSlide = ensureSlide();
        if (!lastSlide) continue;
        if (subtitleMatch) {
          appendSlideTip(lastSlide, subtitleMatch[1]);
        } else if (!/^#{1,6}\s/.test(raw)) {
          // 无 bullet 的普通段落也视为本页大纲描述/副标题（模型常见写法）
          appendSlideTip(lastSlide, raw);
        }
      }
    }
    // 添加最后一个章节（跳过无幻灯片的空章）
    if (currentChapter && currentChapter.slides.length > 0) {
      finalizeSlide(currentChapter.slides[currentChapter.slides.length - 1]);
    }
    pushChapterIfHasSlides();
    return chapters;
  }

  /**
   * 用于检查格式正不正确。
   * @param chapters
   */
  static checkChapter(chapters:Array<Chapter>){
    if (!chapters || chapters.length==0) {
      return {code:-1,msg:"大纲格式不正确，没有发现任何章节，章节前缀应该为【## 】，注意空格"};
    }else{
      let slidesCnt=0
      for (let i=0;i<chapters.length;i++) {
        const slides=chapters[i].slides;
        if(!slides || slides.length===0){
          return {code:-2,msg:`大纲格式不正确，第${i+1}章没发现任何幻灯片。PPT章节应以【## 】开头单独一行，每章下至少一张幻灯片以【### 】开头单独一行（注意井号后空格）；要点用【- 】。`}
        }
        slidesCnt+=slides.length;
      }
      return {code:0, msg:`大纲格式正确，一共发现${chapters.length}章，${slidesCnt}张幻灯片。`}
    }
  }

  /**
   * 获取全局key
   * @param chapters
   * @param key
   * @return ("chapter-1","slide-2")，
   * 若chapters空或paragraph为空，返回undefined，必须前端保证第一章第一节有内容
   */
  static getKeysFromKey(chapters:Array<Chapter>,key:string){
    if (!chapters?.length || !chapters[0]?.slides?.length) {
      return undefined;
    }
    for (let chapter of chapters) {
      if(chapter.key===key){
        return new PptKeys(key,chapter.slides[0].key)
      }else{
        const slides=chapter.slides;
        if (Array.isArray(slides)) {
          for(let slide of slides) {
            if(slide.key===key){
              return new PptKeys(chapter.key,key);
            }
          }
        }
      }
    }
    // if(chapters.length==0||chapters[0].slides.length==0){
    //   return undefined;
    // }else {
      return new PptKeys(chapters[0].key, chapters[0].slides[0].key)
    // }
  }

  /**
   * 为一个文档大纲的某个段落设置提示词 //TODO-hezl 可以优化
   * @param chapters
   * @param key
   * @param prompt
   */
  static setPrompt(chapters:Chapter[],key:string,prompt:string){
    for (let chapter of chapters) {
      if(chapter.key===key){
        // chapter.setPrompt(prompt);
        return;
      }else{
        const slides = chapter.slides;
        if (Array.isArray(slides)) {
          for (let slide of slides) {
            if(slide.key===key){
              slide.setPrompt(prompt);
              return;
            }
          }
        }
      }
    }
    console.log("出错了。items里找不到key："+key);
  }
  static setAllPrompt_ppt(chapters:Chapter[],pptTitle:string,format_prompt:string=""){
    for (let chapter of chapters) {
      const slides = chapter.slides;
      if (Array.isArray(slides)) {
        const siblingTitles = slides.map((s) => (s.title || '').trim()).filter(Boolean);
        for(let slide of slides) {
          // metric / metric_list：把「586亿…同比增长42.3%」拆成多条数据卡，避免同比数字埋在长句里
          let sub = slide.subTitle || '';
          if (slide.layout === 'metric' || slide.layout === 'metric_list') {
            const norm = normalizeMetricListSubtitle(sub);
            if (norm && norm !== sub) {
              sub = norm;
              slide.subTitle = norm;
            }
          }
          // columns / metric_columns：把「赛道为…/涉及 A、B」伪分栏收成 col:/colSub:/短条目
          if (slide.layout === 'columns' || slide.layout === 'metric_columns') {
            const norm = normalizeColumnsSubtitle(sub);
            if (norm && norm !== sub) {
              sub = norm;
              slide.subTitle = norm;
            }
          }
          const { metrics, lists } = splitMetricListTips(sub);
          const cols = parseColumnBlocks(sub);
          const isOverview =
            /三种|对照|几大打法|打法总览|打法一览/.test(slide.title || '');
          const hasCaseFollowUps = siblingTitles.some(
            (t) =>
              t !== (slide.title || '').trim() &&
              /案例|高举高打|精种准打|聚流快打/.test(t),
          );
          const siblingBlock =
            siblingTitles.length > 1
              ? [
                  '【同章其他页·勿抢戏】',
                  ...siblingTitles
                    .filter((t) => t !== (slide.title || '').trim())
                    .map((t) => `- ${t}`),
                  '本页只写本页标题该写的内容；专名/案例动作归属以「标题点名的打法/品牌」为准，不要把别页案例的事实挂到本页错误栏目下。',
                  '',
                ].join('\n')
              : '';

          let task = slide.layout === 'metric'
            ? `请把「${slide.title || '本页'}」写成数据卡：只列检索结果里的原数字，解读只写这个数字比章节名和本页标题多出来的那一点。不要复述章节名、本页标题、年份和品类。不要写做法清单，不要补充检索里没有的周期或配比。`
              : slide.layout === 'metric_list'
              ? `请把「${slide.title || '本页'}」写成「数据卡+要点」复合页：先写数据卡（每行一个原数字+短口径，禁止两数揉一行、禁止类目名当数据卡），再写判断要点（短结论，不要与标题重复、不要把一句砍两半）。不要复述章节名与本页标题。`
              : slide.layout === 'columns'
                ? (isOverview && hasCaseFollowUps
                  ? `请把「${slide.title || '本页'}」写成打法对照总览：按大纲各栏输出短条目（宜 4～16 字）。条目必须精准挂靠该栏打法——材料里属于「高举高打」的专名/动作只能进高举高打栏（如跨界懂车帝），禁止因「种草」等词误挂到精种准打。总览写短标签，不要写成案例时间线长叙述；更细事实与数据节点留给后面案例页。`
                  : `请把「${slide.title || '本页'}」写成分栏短条目：只展开各栏下的「- 短条目」，不要把栏标题/副标写成编号行；每行一个短词或短句（宜 4～16 字）。`)
                : slide.layout === 'metric_columns'
                  ? `请把「${slide.title || '本页'}」写成「上数据卡+下分栏」：先输出原数字+短口径，再只输出各栏短条目（不要输出栏标题行）。不要复述章节名与本页标题。`
                  : slide.layout === 'table'
                    ? `请把「${slide.title || '本页'}」写成表格行：每行用竖线分隔单元格（维度|数值|增速|口径），数字须来自检索原文，单元格宜短。`
                    : slide.layout === 'image_grid'
                      ? `请把「${slide.title || '本页'}」写成 2×2 图鉴图注：输出 2～4 行短图注（每行 4～16 字），对应四格图片说明。`
                      : buildSlideTaskInstruction(slide.title);
          if (
            /高举高打|精种准打|聚流快打/.test(slide.title || '') &&
            /案例/.test(slide.title || '')
          ) {
            task +=
              '本页是单一打法案例 list：只写该打法下更细的事实节点，尽量带材料原数字/结果（播放量、GMV、榜单、周期等）；可深化总览栏内短标签，但不要把别的打法栏的事实挪进来。';
          }
          const outlineTips = parseSlideTips(sub);
          const outlineBlock =
            (slide.layout === 'columns' || slide.layout === 'metric_columns') && cols.length >= 2
              ? (slide.layout === 'metric_columns'
                  ? [
                      metrics.length
                        ? [
                            '【大纲要点·上半数据卡】',
                            ...metrics.map((t, i) => `${i + 1}) [数据卡] ${t}`),
                            '',
                          ].join('\n')
                        : '',
                      formatColumnsOutlineForPrompt(sub),
                    ].join('')
                  : formatColumnsOutlineForPrompt(sub))
              : outlineTips.length
                ? [
                    '【大纲要点】',
                    '（请优先采信其中的事实与数据，据此展开，勿编造冲突数字）',
                    ...outlineTips.map((t, i) =>
                      `${i + 1}) [${t.role === 'metric' ? '数据卡' : '要点'}] ${t.text}`,
                    ),
                    '',
                  ].join('\n')
                : '';
          // 输出格式由生成请求侧追加 format_prompt，避免与 prompt 内重复
          void format_prompt;
          const itemCountForCols = cols.reduce((n, c) => n + (c.items?.length || 0), 0);
          const countHint = slide.layout === 'metric'
            ? (outlineTips.length
              ? `本页是数据卡，大纲共 ${outlineTips.length} 条。必须且只能输出 ${outlineTips.length} 行。每行以原数字开头，解读 ${PPT_METRIC_DESC_MIN}～${PPT_METRIC_DESC_MAX} 字，且不得重复【当前章节】和【本页标题】中的词语。禁止换算，禁止编造检索里没有的比例、金额或天数。`
              : '本页是数据卡。输出 2～5 行，每行以检索中的原数字开头。禁止换算或编造数字。')
            : slide.layout === 'metric_list'
              ? `本页是数据卡+要点：前 ${metrics.length} 行为数据卡，后 ${lists.length} 行为列表要点，必须且只能输出 ${outlineTips.length} 行。`
              : slide.layout === 'columns'
                ? (itemCountForCols
                  ? `本页是分栏，共 ${cols.length} 栏、${itemCountForCols} 条短条目。按栏顺序输出 ${itemCountForCols} 行短词/短句（不要输出栏标题行，不要写 col:）。各栏条目必须精准挂靠，禁止跨栏错挂专名。`
                  : isOverview && hasCaseFollowUps
                    ? '本页是打法对照总览：大纲若暂无短条目，仍按各栏从材料摘 2 条以内短标签（归属必须准）；不要写成长案例叙述。'
                    : '本页是分栏，输出短词/短句。')
                : slide.layout === 'metric_columns'
                  ? `本页是上数据卡+下分栏：前 ${metrics.length || '若干'} 行为数据卡，其后按栏输出短条目（不要输出 col:）。`
                  : slide.layout === 'table'
                    ? (outlineTips.length
                      ? `本页是表格，大纲共 ${outlineTips.length} 行。必须且只能输出 ${outlineTips.length} 行，每行用 | 分隔单元格。`
                      : '本页是表格，每行用 | 分隔单元格（维度|数值|增速|口径）。')
                    : slide.layout === 'image_grid'
                      ? (outlineTips.length
                        ? `本页是 2×2 图鉴，大纲共 ${Math.min(4, outlineTips.length)} 条图注。必须输出对应行数短图注。`
                        : '本页是 2×2 图鉴，输出 2～4 行短图注。')
                  : (outlineTips.length
              ? `本页大纲共 ${outlineTips.length} 条，必须且只能输出 ${outlineTips.length} 个小点。每条要点对应 1 个小点：标题对应该要点，描述只写该要点多出来的事实；各点描述禁止雷同，不要把同一段品牌故事整段粘到多点。`
              : '');
          const prompt = [
            '【PPT 主题】',
            pptTitle || '（未命名）',
            '',
            '【当前章节】',
            chapter.title || '（未命名章节）',
            '',
            '【本页标题】',
            slide.title || '（未命名幻灯片）',
            '',
            siblingBlock,
            outlineBlock,
            '【写作任务】',
            task,
            countHint,
          ]
            .filter((line) => line !== undefined && line !== null)
            .join('\n')
            .replace(/\n{3,}/g, '\n\n');
          slide.setPrompt(prompt);
        }
      }
    }
    return chapters;
  }

  static markGenError(chapters: Chapter[], key: string, error: string) {
    const slide = Ppt.getSlide(chapters, key);
    if (slide !== undefined) {
      slide.genError = error || "内容生成失败";
    }
  }

  static setContent(chapters: Chapter[], key: string, content: string) {
    let slide=this.getSlide(chapters,key);
    if(slide!==undefined){
      slide.setContent(content);
    }else{
      console.log(`出错了。找不到${key}对应的幻灯片`)
    }
  }

  /** 对已有正文但未解析出小项的幻灯片，用当前规则重新解析 */
  static reparseAllSlideContents(chapters: Chapter[]) {
    if (!Array.isArray(chapters)) return chapters;
    for (const chapter of chapters) {
      const slides = chapter.slides;
      if (!Array.isArray(slides)) continue;
      for (const slide of slides) {
        if (slide.content && (!slide.viewItems || slide.viewItems.length === 0)) {
          slide.setContent(slide.content);
        }
      }
    }
    return chapters;
  }

  /**
   * 找出「有正文但未解析出小项」的幻灯片（不可用于 PPT 变量填充）。
   */
  static getSlidesWithBadFormat(chapters: Chapter[]): Array<{ key: string; title: string }> {
    const bad: Array<{ key: string; title: string }> = [];
    if (!Array.isArray(chapters)) return bad;
    for (const chapter of chapters) {
      const slides = chapter.slides;
      if (!Array.isArray(slides)) continue;
      for (const slide of slides) {
        const hasContent = !!(slide.content && slide.content.trim());
        const itemCount = slide.viewItems ? slide.viewItems.length : 0;
        if (hasContent && itemCount === 0) {
          bad.push({ key: slide.key, title: slide.title || slide.label || slide.key });
        }
      }
    }
    return bad;
  }

  /**
   * 为 PPT 模板补齐 item1..itemN，避免占位符 {vItem.itemN} 原样残留。
   */
  static padVItemForTemplate(vItem: Dictionary<string>, itemCounts: number) {
    const n = Math.max(3, Math.min(5, itemCounts || 3));
    for (let i = 1; i <= n; i++) {
      if (vItem[`item${i}`] === undefined) vItem[`item${i}`] = '';
      if (vItem[`item${i}_Desc`] === undefined) vItem[`item${i}_Desc`] = '';
    }
    return n;
  }

  /** 数据卡标题都是原数字时才用数据卡模板，否则调用方应退回 list。 */
  static canFillMetric(vItem: Dictionary<string>): boolean {
    const titles: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const t = (vItem[`item${i}`] || '').trim();
      if (t) titles.push(t);
    }
    if (titles.length < 2 || titles.length > 5) return false;
    return titles.every((t) => metricTitleOk(t));
  }

  /** 2～5 条按实际卡数补空槽（对齐模板 24～27 页）。 */
  static padMetricVItem(vItem: Dictionary<string>, itemCounts: number) {
    const slots = Math.max(2, Math.min(5, itemCounts || 3));
    for (let i = 1; i <= slots; i++) {
      if (vItem[`item${i}`] === undefined) vItem[`item${i}`] = '';
      if (vItem[`item${i}_Desc`] === undefined) vItem[`item${i}_Desc`] = '';
    }
    return slots;
  }

  /** 从完整 vItem 截取一段，用于 metric_list 拆页（from 从 0 起）。 */
  static sliceVItem(vItem: Dictionary<string>, from: number, count: number): Dictionary<string> {
    const out: Dictionary<string> = {};
    for (let i = 0; i < count; i++) {
      const src = from + i + 1;
      out[`item${i + 1}`] = vItem[`item${src}`] || '';
      out[`item${i + 1}_Desc`] = vItem[`item${src}_Desc`] || '';
    }
    return out;
  }

  /** 大纲内容页展开后的物理页数（metric_list 单页模板，计 1）。 */
  static countRenderContentPages(chapters: Chapter[]): number {
    let n = 0;
    for (const chapter of chapters || []) {
      for (const slide of chapter.slides || []) {
        n += outlineSlideRenderPages(slide.layout);
      }
    }
    return n;
  }
  static getSlide(chapters: Chapter[], key: string) {
    for (let chapter of chapters) {
      if (chapter.key === key) {
        // chapter.setContent(content);
        return;
      } else {
        const slides = chapter.slides;
        if (Array.isArray(slides)) {
          for (let slide of slides) {
            if (slide.key === key) {
              return slide;
            }
          }
        }
      }
    }
  }


  /**
   * * 将完整规范（经过检查的）的markdown大纲文档存入storage的分类记录集(比如AiPpt_outlineRecs)中
   * @param markdown  markdown大纲内容
   // * @param outlineRecs  已取出的大纲记录集
   * @param outlineType 可能得类型是outlineTypeDOC，outlineTypeAiDOC
   */
  static addDocOutlineRecToStorage(outlineType:outlineType, markdown:string, kbName:string = "samples"){
    const rawTitle=Ppt.getTitleFromMsg(markdown);
    const rawContent =Ppt.getContentFromMsg(markdown);
    const outlineRec_init=new OutlineRec(rawTitle, rawContent, kbName || "samples");
    OutlineRec.save(outlineType,outlineRec_init)
    return outlineRec_init.outlineId!
  }
  /**
   * 从大纲集合中获得某个记录的具体章节、主题、id等细节
   * @param outlineRecs 大纲记录集
   * @param outlineType 大纲类型
   * @param id  大纲记录ID
   * @param formatPrompt 格式化提示词
   * @Return {[title, content, kbName, chapters]}  [title, content, kbName, chapters]元组
   */
  static get_chapters_from_outlineRecs(outlineRecs:OutlineRec[],outlineType:outlineType,id:string,formatPrompt=""):[string,string,string,Chapter[]]{
    const or=OutlineRec.getRecById(outlineRecs,id);
    if(!or) {
      return ["", "", "samples", []];
    }
    /**
     * 先初始化chapters结构，再设置所有提示词(重设)。
     */
    let chapters =Ppt.getChaptersFromContent(or.outlineContent);
    chapters = Ppt.setAllPrompt_ppt(chapters, or.outlineName, formatPrompt);
    return [
      or.outlineName? or.outlineName: "",
      or.outlineContent? or.outlineContent: "",
      or.outline_source_kbName&&or.outline_source_kbName.length>0? or.outline_source_kbName: "samples",
      chapters&&chapters.length>0? chapters: []
    ];
  }
  /**
   * 将该大纲中所有生成了的content字段清空。
   * @param chapters
   */

  static clearSlide(chapters:Chapter[]) {
    for (let chapter of chapters) {
      const slides = chapter.slides;
      if (Array.isArray(slides)) {
        for (let slide of slides) {
          slide.viewItems=new Array<ViewItem4Ppt>();
          slide.content="";
        }
      }
    }
  }

}

