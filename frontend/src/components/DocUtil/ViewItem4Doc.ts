import OutlineRec, {outlineType} from "@/components/DocUtil/OutlineStore";
import {stripDocOutlineOrdinal} from "@/components/DocUtil/docOutlineStructure";
import {normalizeDocDepth} from "@/components/DocUtil/docHeadingDepth";
import {
  WordBudget,
  clampWordBudget,
  formatWordBudgetZh,
  wordBudgetFor,
} from "@/components/DocUtil/docWordBudget";
import {
  preprocessDegradedFences,
  matchFenceOpen,
  seedFenceBuffer,
} from "@/components/DocUtil/docFenceNormalize";
export type { WordBudget } from "@/components/DocUtil/docWordBudget";
export {
  DOC_WORD_BUDGET,
  clampWordBudget,
  formatWordBudgetZh,
  wordBudgetFor,
} from "@/components/DocUtil/docWordBudget";
export type CheckMsg={
  code:number;
  msg:string;
};

export class DocKeys {
  chapterKey:string;
  paragraphKey:string;
  constructor(key1:string,key2:string) {
    this.chapterKey = key1;
    this.paragraphKey = key2;
  }
}

/**
 * 章/段标题轻清洗（十·1 / B1）：只剥锚定前缀序数与装饰符，
 * **不得**全局删除 0-9 / 一~十 / 拉丁字母（会把「衬衫200元」「polo衫」吃成「衬衫元」「衫」）。
 * 差集里若丢失 [0-9a-zA-Z] → console.warn（先 Warn 不拒单）。
 */
export function cleanDocTitle(raw: string): string {
  const before = String(raw || "");
  let s = before.trim().replace(/^#+\s*/, "");
  const afterOrdinal = stripDocOutlineOrdinal(s);
  // 纯装饰：下划线、井号、首尾冒号；不删空格与正文标点
  s = afterOrdinal.replace(/[_＃#]/g, "").replace(/^[：:]+|[：:]+$/g, "").trim();

  // 只对「序数剥离之后」仍丢字母数字报警（1.1→趋势分析 属预期，不报）
  const beforeChars = new Set([...afterOrdinal.replace(/\s/g, "")]);
  const afterChars = new Set([...s.replace(/\s/g, "")]);
  const lostAlnum = [...beforeChars].filter(
    (c) => !afterChars.has(c) && /[0-9a-zA-Z]/i.test(c),
  );
  if (lostAlnum.length > 0) {
    console.warn("[标题保真] 清洗丢失字母数字", {
      before,
      after: s,
      lost: lostAlnum,
    });
  }
  return s;
}

/** @deprecated 使用 cleanDocTitle；保留别名以免旧调用误伤 */
const cleanString = (bigString: string): string => cleanDocTitle(bigString);
/****用于清除```markdown\清除前导和结尾空行等标识```*****/
export const clean4DocTitle=(str:string)=>{
  str=str.replace(/```markdown\n|```txt\n|```\n|```/, '');
  // str=str.replace(/^\s+|\s+$/gm, '');
  return str
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

export class ViewItem4Doc {
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
     * 根据文本产生观点及其具体描述内容。word文档中暂时不需要
     * @param viewStr
     * 返回undefined时说明格式有问题
     */
    // static genViewItemByRegex(viewStr:string){
    //     const regexp =/(?<=\d[.] (.*)[\n|\s]*(?=(?:-[\n|\s]*(.*)[。｜\n])))/g
    //     const result=viewStr.matchAll(regexp)
    //     const itemArray=[...result].map(m=>m.slice(1));
    //     if(itemArray.length===1){return undefined}
    //     const viewItems=new Array<ViewItem4Ppt>()
    //     itemArray.forEach((item,index)=>{
    //         if(item.length===1){return undefined}
    //         viewItems.push(new ViewItem4Ppt(index+1,item[0],item[1]))
    //     });
    //     return viewItems;
    // }
}

/** Word 段落级表/图块（七·3）；对应大纲 ```table / ```figure */
export type DocBlock =
  | {kind: "table"; caption: string; rows: string[][]}
  | {kind: "figure"; assetRef: string; caption: string};

export class Paragraph{
  /** 段落条目在章节层级中的索引，不是总索引 **/
  index:number;
  title:string;
  subTitle:string="";
  /** 段落在章节中的索引  比如 "chapter-2"中 的“paragraph-1”  --used by Collapse  ,it's key==paragraph's index**/
  key:string;
  /** 段落标题  --used by Collapse ,it's label==slide's title**/
  label:string;
  prompt:string="";
  content:string="";
  /** 段落级表/图块；默认空 → 存量大纲零回归 */
  blocks: DocBlock[] = [];
  /** ### → true；* + - → false（八·3：额度只算 heading） */
  heading: boolean = false;
  /** 十五·3：2=章级生成单元，3=段；4+ 留给 P1 */
  level: number = 3;
  /**
   * 显式容器（不发 HTTP）。不能用「content 为空」判断——生成前正文本来就是空的。
   */
  container: boolean = false;
  /** 十五·R2：超深子点折进写作提示后留在这里，避免 setAllPrompt 覆盖丢失 */
  pointGuide: string = "";
  /**
   * 十三·B：`####` 子点（数据点/对照点）；模板 `{#points}{label}` → heading 3。
   * docxtemplater 读 `label` 字段。
   */
  points: Array<{label: string}> = [];
  /** 十四·14.3.4：段级字数预算；null 则按 heading/container 取默认 */
  wordBudget: WordBudget | null = null;
  /** 十四·14.3.5：岗位视角（简单层） */
  role: string = "";
  /** 十四·14.3.5：本章要回答的问题（简单层） */
  question: string = "";
  /** 十四·14.3.5：是否允许出表 / 出图 */
  allowTable: boolean = true;
  allowFigure: boolean = true;
  /**
   * 二十三·13：本段生成时注入的 figure ref 白名单（formatKbAssetRef）。
   * 渲染时精确匹配；空且 allowFigure=false → 禁全部。
   */
  allowedFigureRefs: string[] = [];
  /**
   * 十四·14.3.5：高级层手改过整串 prompt 后为 true；
   * 简单层改字段时若为 false 则重拼 prompt。
   */
  promptManual: boolean = false;

  constructor(index:number, title:string,subTitle?:string) {
    this.index = index;
    this.title = title;
    this.subTitle = subTitle?subTitle:"";
    // this.key = index-1;
    this.key = "paragraph-"+index;
    this.label= title;
  }
  isContainer(): boolean {
    return this.container;
  }
  setPrompt(prompt:string){
    this.prompt = prompt;
  }

  /**
   * 单纯设置观点数组 word无用
   * @param viewItems
   */
  /*setResult(viewItems:Array<ViewItem4Ppt>){
    this.viewItems = viewItems;
  }*/

  /**
   * 4word，将paragrah中的内容返回。
   * 若content无值，返回空子串
   * 若content有值，返回组合内容。
   */
  getContent(){
    if(this.content.length===0){
      return "";
    }else{
      return this.content;
    }
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
    // 生成当刻剥离 ```table/figure → blocks，右栏即可显示「表/图」状态
    absorbBlocksFromParagraphContent(this);
    return true
  }
}

export class Chapter {
  /** 章节条目在大纲中层级中的索引，不是总索引 **/
  index: number;
  title: string;
  subTitle: string = ""; //大部分没用，预留
  /** 章节条目在大纲层级中的索引  比如大纲中 “chapter-1”  --used by Collapse **/
  key:string;
  label: string; //used by Collapse ,it's label==slide's title
  prompt: string = ""; //大部分没用，预留
  paragraphs:Array<Paragraph> = new Array<Paragraph>();
  /** 十五·R1：单子塌陷后要点上提到章；生成前再物化成一个段落 */
  points: Array<{label: string}> = [];
  collapsed: boolean = false;
  pointGuide: string = "";

  constructor(index: number, title: string) {
    this.index = index;
    this.title = title;
    this.key = "chapter-"+index;
    this.label = title;
  }
}

/*export class SlideVar{
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

}*/

export type DocFormatPromptOpts = {
  allowTable?: boolean;
  allowFigure?: boolean;
};

/**
 * 文章段落写作契约（对齐 PPT format prompt 角色，输出散文而非编号行）。
 * 七·3 围栏 + 九·4 可判定表/图判据；十四·14.3.4 字数取自 WordBudget。
 */
export function buildDocParagraphFormatPrompt(
  budget?: WordBudget | null,
  opts?: DocFormatPromptOpts,
): string {
  const b = clampWordBudget(
    budget && (budget.min > 0 || budget.max > 0)
      ? budget
      : wordBudgetFor({ heading: true }),
  );
  const zh = formatWordBudgetZh(b);
  const allowTable = opts?.allowTable !== false;
  const allowFigure = opts?.allowFigure !== false;
  let s =
    '\n\n【输出格式·文章段落】\n' +
    `直接输出约 ${zh} 字连贯正文，可分 1～3 个自然段。\n` +
    '禁止「1. 标题 - 描述」编号清单；禁止只写 bullet 列表替代正文。\n' +
    '禁止以「根据知识库」「材料显示」「综上所述」等套话开头或结尾；\n' +
    '禁止以「从……来看 / 在……上 / 落到……上」这类视角介词短语开头——\n' +
    '首句必须直接切入本段的主体（实体名、数据或判断），不得先声明观察角度。\n' +
    '数字与专名须可溯；材料没有的数据禁止编造。\n';
  if (allowTable) {
    s +=
      '\n【表·须同时满足才可追加 ```table】\n' +
      '- 材料里同一组字段被复述给 ≥2 个对象（品类×指标、价格带×销量、时段×值等）；\n' +
      '- 该组 ≥2 行 × ≥2 列，且行与行同质可比；\n' +
      '- 反例（不要出表）：① 只有 1 个对象；② 只是把正文已列数字再抄一遍；③ 为一句结论配表。\n' +
      '- 表格 ≤8 行 × 5 列。\n';
  } else {
    s += '\n【表】本段禁止输出 ```table 围栏。\n';
  }
  if (allowFigure) {
    s +=
      '\n【图·须同时满足才可追加 ```figure】\n' +
      '- 本段对象在【可用插图资产】里有对应条目，且 ref 只能原样复制清单字符串；\n' +
      '- 该图就在本段上下文（不是别段的对象）；一段最多 1 张图；\n' +
      '- 清单为空或未提供【可用插图资产】→ **禁止**写 figure。\n';
  } else {
    s += '\n【图】本段禁止输出 ```figure 围栏。\n';
  }
  if (allowTable || allowFigure) {
    s +=
      '\n【围栏格式】表/图紧跟正文之后：\n' +
      '```table\ncaption: 表题\n| 列1 | 列2 |\n| 值 | 值 |\n```\n' +
      '```figure\nref: kb:文档名/相对路径\ncaption: 图题\n```\n';
  }
  return s;
}

export type AssembleDocParagraphOpts = {
  docTitle: string;
  chapterTitle: string;
  siblings?: string[];
  isConclusionChapter?: boolean;
  /** 是否追加 format 契约；默认 true */
  includeFormat?: boolean;
};

/**
 * 十四·14.3.5：由段级结构化字段拼写作 prompt。
 * 若 promptManual 且 prompt 非空，直接返回存量整串（兼容旧大纲）。
 */
export function assembleDocParagraphPrompt(
  paragraph: Paragraph,
  opts: AssembleDocParagraphOpts,
): string {
  if (paragraph.promptManual && (paragraph.prompt || "").trim()) {
    return paragraph.prompt;
  }
  const budget = wordBudgetFor(paragraph);
  const zh = formatWordBudgetZh(budget);
  const role =
    (paragraph.role || "").trim() ||
    inferDocWritingRole(opts.docTitle);
  const question =
    (paragraph.question || "").trim() ||
    `围绕「${opts.chapterTitle}」说明本段「${paragraph.title}」对该问题的贡献`;
  const docTitle =
    (opts.docTitle || "").trim() || "未命名文档";
  let prompt =
    `文章标题是<${docTitle}>，请为它的【${opts.chapterTitle}】章节中的段落： [${paragraph.title}]撰写约${zh}字的具体内容。` +
    `直接输出正文；禁止以「根据知识库内容」等套话开头；` +
    `禁止以「从……来看 / 在……上 / 落到……上」这类视角介词短语开头——` +
    `首句须直接切入本段主体（实体名、数据或判断）。`;
  const guide = paragraph.pointGuide || "";
  if (paragraph.points.length) {
    const labels = paragraph.points
      .map((pt) => pt.label)
      .filter(Boolean)
      .slice(0, 6);
    if (labels.length) prompt += `【本段要点】${labels.join("、")}。`;
  } else if (guide) {
    prompt += guide.endsWith("。") ? guide : `${guide}。`;
  }
  if (role) {
    prompt += `请以「${role}」岗位视角撰写，用该岗位的判断口径，勿写成百科介绍。`;
  }
  prompt += `本章要回答的问题：${question}；勿跑题。`;
  const siblings = (opts.siblings || []).filter(Boolean);
  if (siblings.length) {
    prompt += `同章其他段落（内容勿重复）：${siblings.join("、")}。`;
  }
  if (opts.isConclusionChapter) {
    prompt +=
      `本段属结论/建议归属章：给出可执行判断与动作，勿堆砌前文已写过的同一组数字；` +
      `凡建议/预判/取舍类判断句末须标「（推演）」；结论中的数值必须前文正文已出现过。`;
  } else {
    prompt +=
      `结论与行动建议留给末章；本段只写本段题所需的事实与分析。`;
  }
  if (opts.includeFormat !== false) {
    prompt += buildDocParagraphFormatPrompt(budget, {
      allowTable: paragraph.allowTable !== false,
      allowFigure: paragraph.allowFigure !== false,
    });
  }
  return prompt;
}

/** 段是否已带结构化字段（相对「仅整串 prompt」的存量） */
export function paragraphHasStructuredPrompt(p: Paragraph): boolean {
  if (p.wordBudget != null) return true;
  if (p.role && p.role.trim()) return true;
  if (p.question && p.question.trim()) return true;
  return false;
}

/** 从 pointGuide / 整串里的【本段要点】抽出标签列表 */
export function labelsFromPointGuide(guide: string): string[] {
  let g = String(guide || "").trim();
  if (!g) return [];
  const m = g.match(/【本段要点】([^】\n]*)/);
  if (m) g = m[1];
  else g = g.replace(/^【本段要点】/, "");
  g = g.replace(/[。．]\s*$/, "").trim();
  if (!g) return [];
  return g
    .split(/[、,，;；]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 简单层「要点」回显源：points 优先；
 * maxLevel≤3 时 normalizeDocDepth 会把 #### 折进 pointGuide 并清空 points，须回读 guide；
 * 再不行从已拼 prompt 里抠【本段要点】。
 */
export function paragraphPointLabels(p: {
  points?: Array<{ label: string }>;
  pointGuide?: string;
  prompt?: string;
}): string[] {
  const fromPts = (p.points || []).map((x) => x.label).filter(Boolean);
  if (fromPts.length) return fromPts;
  const fromGuide = labelsFromPointGuide(p.pointGuide || "");
  if (fromGuide.length) return fromGuide;
  return labelsFromPointGuide(p.prompt || "");
}

/** 写作提示用的要点串（与 normalizeDocDepth 的 pointLine 同形） */
export function pointGuideFromLabels(labels: string[]): string {
  const xs = (labels || []).map((s) => String(s || "").trim()).filter(Boolean);
  return xs.length ? `【本段要点】${xs.join("、")}` : "";
}

/** 十四·14.3.5：提示词保存补丁（简单层字段 + 拼好的 prompt） */
export type DocPromptSavePatch = {
  prompt: string;
  wordBudget?: WordBudget | null;
  role?: string;
  question?: string;
  allowTable?: boolean;
  allowFigure?: boolean;
  promptManual?: boolean;
  /** 简单层编辑的要点；落盘时同步进 pointGuide，并清空 points（对齐 maxLevel≤3 折进提示） */
  points?: Array<{ label: string }>;
};

export function applyDocPromptSavePatch(
  paragraph: Paragraph,
  patch: DocPromptSavePatch | string,
): void {
  if (typeof patch === "string") {
    paragraph.setPrompt(patch);
    paragraph.promptManual = true;
    return;
  }
  if (patch.wordBudget !== undefined) paragraph.wordBudget = patch.wordBudget;
  if (patch.role !== undefined) paragraph.role = patch.role;
  if (patch.question !== undefined) paragraph.question = patch.question;
  if (patch.allowTable !== undefined) paragraph.allowTable = patch.allowTable;
  if (patch.allowFigure !== undefined) paragraph.allowFigure = patch.allowFigure;
  if (patch.promptManual !== undefined) paragraph.promptManual = patch.promptManual;
  if (patch.points !== undefined) {
    const labels = patch.points.map((x) => x.label).filter(Boolean);
    // 折进写作提示：简单层改的要点写 pointGuide；points 清空以免 docx 再出三级标题
    paragraph.pointGuide = pointGuideFromLabels(labels);
    paragraph.points = [];
  }
  paragraph.setPrompt(patch.prompt);
}

/** 末章是否像结论/建议（十一·3 / 9.3） */
export const DOC_CONCLUSION_CHAPTER_RE =
  /结论|建议|动作|取舍|下一步|筛选与打法/;

/**
 * 十三·A：段题「数据句」体检——过长 / 含阿拉伯数字 / 含引注 / 逗号并列。
 * 命中则不应占 h2，应降级为正文首句引导。
 */
export function isDataLikeDocParagraphTitle(title: string): boolean {
  const t = String(title || "").trim();
  if (!t) return false;
  if (t.length > 20) return true;
  if (/\d/.test(t)) return true;
  if (/\[文档/.test(t)) return true;
  if (/[，,]/.test(t)) return true;
  return false;
}

/** 最近一次 getChaptersFromContent 的段题降级记录（供 checkChapter Warn） */
export let lastDocTitleDemotions: string[] = [];

const TITLE_OVERLAP_STOP = new Set([
  "与",
  "的",
  "和",
  "及",
  "其",
  "等",
  "概览",
  "分析",
  "表现",
  "情况",
  "相关",
  "关于",
  "对于",
  "结构",
  "对照",
]);

/** 段题 token（字母词 + 数字 + 汉字二元），供 9.4 互斥 */
export function docParagraphTitleTokens(title: string): Set<string> {
  const s = cleanDocTitle(title || "").replace(/\s+/g, "");
  const toks = new Set<string>();
  for (const m of s.matchAll(/[A-Za-z][A-Za-z0-9]*/g)) {
    toks.add(m[0].toLowerCase());
  }
  for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) {
    toks.add(m[0]);
  }
  const cjk = [...s].filter((c) => /[\u4e00-\u9fff]/.test(c)).join("");
  for (let i = 0; i < cjk.length - 1; i++) {
    const a = cjk[i];
    const b = cjk[i + 1];
    if (TITLE_OVERLAP_STOP.has(a) || TITLE_OVERLAP_STOP.has(b)) continue;
    const bg = a + b;
    if (TITLE_OVERLAP_STOP.has(bg)) continue;
    toks.add(bg);
  }
  return toks;
}

function titleJaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/**
 * 十一·3 / 9.4：段题互斥扫描（跨章）。
 * 返回过近的段题对（Jaccard≥0.55 或归一后相等）。
 */
export function findOverlappingParagraphTitles(
  chapters: Chapter[],
  threshold = 0.55,
): Array<{a: string; b: string; score: number}> {
  type Row = {title: string; tokens: Set<string>};
  const rows: Row[] = [];
  for (const ch of chapters || []) {
    for (const p of ch.paragraphs || []) {
      const title = String(p.title || "").trim();
      if (title.length < 2) continue;
      rows.push({title, tokens: docParagraphTitleTokens(title)});
    }
  }
  const out: Array<{a: string; b: string; score: number}> = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const ta = cleanDocTitle(rows[i].title);
      const tb = cleanDocTitle(rows[j].title);
      // 过短段题（测试占位「段1」等）不做互斥，避免误伤
      if (!ta || !tb || ta.length < 4 || tb.length < 4) continue;
      if (ta === tb) {
        out.push({a: rows[i].title, b: rows[j].title, score: 1});
        continue;
      }
      if (rows[i].tokens.size < 2 || rows[j].tokens.size < 2) continue;
      const score = titleJaccard(rows[i].tokens, rows[j].tokens);
      if (score >= threshold) {
        out.push({a: rows[i].title, b: rows[j].title, score});
      }
    }
  }
  out.sort((x, y) => y.score - x.score);
  return out;
}

/** 从文章标题推断写作岗位；空串表示不注入人设（勿默认「读者」） */
export function inferDocWritingRole(title: string): string {
  const t = title || "";
  if (/选品/.test(t)) return "选品师";
  if (/运营/.test(t)) return "运营";
  if (/汇报|领导|管理层/.test(t)) return "管理者";
  return "";
}

/** 段落写作上下文（十一·3 / 9.1） */
export type DocParagraphPromptCtx = {
  /** 岗位；缺省则按标题推断 */
  role?: string;
  /** 十五：体裁上界；缺省 3（#### 折进要点，不另起标题） */
  maxLevel?: number;
  /**
   * 二十一·9：无图资产时传 false（Ai 页恒 false；KB 按清单）。
   * 缺省 true。
   */
  allowFigure?: boolean;
};

/**
 * 十四·3.2：只生成真正的 ### 段。整章没有 ### 时退回全部段落（存量 `*` 大纲）。
 * 容器段不发请求。
 */
export function paragraphsToGenerate(chapter: Chapter): Paragraph[] {
  const paras = (chapter?.paragraphs || []).filter((p) => !p.isContainer());
  const headings = paras.filter((p) => p.heading);
  return headings.length ? headings : paras;
}

/** 二十三·6：空段占位（勿静默留白） */
export const DOC_EMPTY_CONTENT_PLACEHOLDER = "（本段生成失败）";

/**
 * 扫描应生成却 content 为空的段：warn + 写入占位。
 * 返回被占位的段 key 列表。
 */
export function flagEmptyDocParagraphs(chapters: Chapter[]): string[] {
  const emptyKeys: string[] = [];
  for (const ch of chapters || []) {
    for (const p of paragraphsToGenerate(ch)) {
      if ((p.content || "").trim()) continue;
      emptyKeys.push(p.key);
      console.warn(`[空段] ${p.key}「${p.title}」content 为空，已写入占位`);
      p.content = DOC_EMPTY_CONTENT_PLACEHOLDER;
      p.blocks = [];
    }
  }
  return emptyKeys;
}

/**
 * 本地无大纲时的种子样例：### 段落 + 结论章（替换遗留 * 1.1 / 六章无关总结，十一·2）。
 */
export const DOC_OUTLINE_MARKDOWN_INIT =
  "# 抖音男装选品要点\n\n" +
  "## 大盘与类目机会\n\n" +
  "### 规模与增速\n\n" +
  "### 机会赛道概览\n\n" +
  "## 证据与货盘对照\n\n" +
  "### 热销结构\n\n" +
  "### 价格带与客群\n\n" +
  "## 风险与不选什么\n\n" +
  "### 高风险信号\n\n" +
  "### 明确不选清单\n\n" +
  "## 选品结论与动作\n\n" +
  "### 优先跟进方向\n\n" +
  "### 近两周动作\n";

const FENCE_END = /^```\s*$/;
const TABLE_SEP = /^\|?[\s:\-|]+ \|/;
/** PPT 元数据行：不进 Word 段落（八·2） */
export const DOC_META_LINE =
  /^[*+\-]\s*(layout|tips|intent|版式|类型|备注|页数)\s*[:：]/i;

/** 保存前剥离大纲中的 PPT 风格元数据行 */
export function stripDocOutlineMetaLines(content: string): string {
  return (content || "")
    .split("\n")
    .filter((line) => !DOC_META_LINE.test(line.trim()))
    .join("\n");
}

/**
 * 一键规范化：去元数据行，并把章下 `* + -` 要点升为 `### `（八·6）。
 * 不改 ## / # / 已是 ### 的行；不碰围栏内。
 */
export function normalizeDocOutlineMarkdown(content: string): string {
  const stripped = stripDocOutlineMetaLines(content);
  const lines = stripped.split("\n");
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^```/.test(t)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    const bullet = t.match(/^[*+\-]\s+(.+)$/);
    if (bullet && !DOC_META_LINE.test(t) && !/^###?\s/.test(t)) {
      out.push(`### ${bullet[1].trim()}`);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** 大纲是否「看起来有章但段落标记不规范」（气泡 Warn，八·6） */
export function docOutlineNeedsNormalizeHint(markdown: string): boolean {
  const raw = markdown || "";
  if (!raw.includes("## ")) return false;
  if (raw.split("\n").some((l) => DOC_META_LINE.test(l.trim()))) return true;
  const hasHeading = /^###\s+/m.test(raw);
  const hasBullet = /^[*+\-]\s+/m.test(raw);
  return !hasHeading && hasBullet;
}

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function isTableSepLine(line: string): boolean {
  const t = line.trim();
  if (!t.includes("|")) return false;
  const cells = splitTableRow(t);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c) || c === "");
}

/** 段内表/图块计数（优先 blocks；正文仍含围栏时兜底扫描） */
export function countParagraphMedia(paragraph: Paragraph): {
  tables: number;
  figures: number;
} {
  let tables = 0;
  let figures = 0;
  for (const b of paragraph.blocks || []) {
    if (b.kind === "table") tables += 1;
    else if (b.kind === "figure") figures += 1;
  }
  if (!tables && !figures) {
    const c = String(paragraph.content || "");
    const tm = c.match(/```\s*table\b/gi);
    const fm = c.match(/```\s*figure\b/gi);
    tables = tm ? tm.length : 0;
    figures = fm ? fm.length : 0;
  }
  return {tables, figures};
}

/** 章内表/图合计 */
export function countChapterMedia(chapter: Chapter): {
  tables: number;
  figures: number;
} {
  let tables = 0;
  let figures = 0;
  for (const p of chapter.paragraphs || []) {
    const n = countParagraphMedia(p);
    tables += n.tables;
    figures += n.figures;
  }
  return {tables, figures};
}

/** 从已生成正文剥离 ```table/figure 并入 paragraph.blocks，返回清洁正文 */
export function absorbBlocksFromParagraphContent(paragraph: Paragraph): string {
  const raw0 = paragraph.content || "";
  // 正文已无围栏（曾吸收过）→ 保留既有 blocks，避免下载前二次吸收清空
  if (!/```/.test(raw0)) {
    return raw0.trim();
  }
  const raw = preprocessDegradedFences(raw0);
  paragraph.blocks = [];
  const lines = raw.split("\n");
  const out: string[] = [];
  let state: "normal" | "table" | "figure" | "unknown" = "normal";
  let buf: string[] = [];
  const flush = () => {
    if (state === "table") {
      const block = parseTableFenceLines(buf);
      if (block) paragraph.blocks.push(block);
      // 无法归一 → 丢弃，不把原文塞回正文（十九·3）
    } else if (state === "figure") {
      const block = parseFigureFenceLines(buf);
      if (block) paragraph.blocks.push(block);
    }
    buf = [];
    state = "normal";
  };
  for (const line of lines) {
    const t = line.trim();
    if (state === "normal") {
      if (FENCE_END.test(t)) {
        // 孤立闭合忽略
        continue;
      }
      const open = matchFenceOpen(t);
      if (open) {
        state = open.kind;
        buf = [];
        seedFenceBuffer(open.kind, open.rest, buf);
        continue;
      }
      if (/^```/.test(t)) {
        state = "unknown";
        buf = [];
        continue;
      }
      out.push(line);
      continue;
    }
    if (FENCE_END.test(t)) {
      flush();
      continue;
    }
    // 围栏内又开新栏（紧邻退化）：先收束再开
    const nested = matchFenceOpen(t);
    if (nested) {
      flush();
      state = nested.kind;
      buf = [];
      seedFenceBuffer(nested.kind, nested.rest, buf);
      continue;
    }
    if (state !== "unknown") buf.push(line);
  }
  if (state !== "normal") flush();
  const plain = out.join("\n").trim();
  paragraph.content = plain;
  return plain;
}

function pushTableRowChunks(blob: string, rows: string[][]) {
  const s = String(blob || "").trim();
  if (!s) return;
  // 退化：多行粘在一行，用 || 分隔
  const chunks = s.includes("||") ? s.split(/\|\|/) : [s];
  for (const chunk of chunks) {
    const c = chunk.trim();
    if (!c || isTableSepLine(c) || TABLE_SEP.test(c)) continue;
    if (!c.includes("|")) continue;
    const parts = splitTableRow(c.includes("|") ? c : `|${c}|`);
    if (parts.length) rows.push(parts);
  }
}

function parseTableFenceLines(lines: string[]): DocBlock | null {
  // 二十一·18：只在 table 缓冲内把 || 拆成多行，避免全文误伤
  const expanded = lines
    .join("\n")
    .replace(/\|[ \t]*\|/g, "|\n|")
    .split("\n");
  let caption = "";
  const rows: string[][] = [];
  for (const raw of expanded) {
    const t = raw.trim();
    if (!t) continue;
    const cap = t.match(/^caption\s*[:：]\s*(.+)$/i);
    if (cap) {
      let body = cap[1].trim();
      // tablecaption 粘连：caption 值里夹着 | 表头
      if (body.includes("|")) {
        const i = body.indexOf("|");
        caption = body.slice(0, i).trim();
        pushTableRowChunks(body.slice(i), rows);
      } else {
        caption = body;
      }
      continue;
    }
    if (isTableSepLine(t) || TABLE_SEP.test(t)) continue;
    if (t.includes("|")) {
      pushTableRowChunks(t, rows);
    }
  }
  if (!rows.length) return null;
  // 防御性截断：≤8 行 × 5 列
  const cols = Math.min(5, Math.max(...rows.map((r) => r.length)));
  const clipped = rows.slice(0, 8).map((r) => {
    const padded = [...r];
    while (padded.length < cols) padded.push("");
    return padded.slice(0, cols);
  });
  if (rows.length > 8 || Math.max(...rows.map((r) => r.length), 0) > 5) {
    if (!/截断/.test(caption)) caption = `${caption || "表"}（表已截断）`;
  }
  return {kind: "table", caption, rows: clipped};
}

function parseFigureFenceLines(lines: string[]): DocBlock | null {
  let caption = "";
  let assetRef = "";
  for (const raw of lines) {
    const t = raw.trim().replace(/```\s*$/, "").trim();
    if (!t) continue;
    const cap = t.match(/^(?:caption|图)\s*[:：]\s*(.+)$/i);
    if (cap) {
      caption = cap[1].trim().replace(/```\s*$/, "").trim();
      continue;
    }
    const ref = t.match(/^(?:ref|assetRef|asset)\s*[:：]\s*(.+)$/i);
    if (ref) {
      let r = ref[1].trim().replace(/```\s*$/, "").trim();
      // 残留 …pngcaption: 题
      const glued = r.match(
        /^(.*\.(?:png|jpe?g|gif|webp))\s*(?:caption|图)\s*[:：]\s*(.*)$/i,
      );
      if (glued) {
        assetRef = glued[1].trim();
        if (!caption) caption = glued[2].trim();
      } else {
        assetRef = r;
      }
      continue;
    }
  }
  if (!assetRef && !caption) return null;
  return {kind: "figure", assetRef, caption};
}

export class Doc{
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
   * 获取所有的幻灯片变量，以便于根据模板生成ppt内容。word暂不需要
   */
  /*static getSlideVars(chapters:Array<Chapter>){
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
        const slideVar=new SlideVar(chapter.index,chapter.title,
          slide.index,slideIndexG,slide.title,slide.subTitle,vItem);
        slideIndexG++;
        slideVars.push(slideVar);
      }
    }
    return slideVars;
  }*/

  /**
   * 从生成的message中获取Word大纲标题（仅一级标题 `# `，不含 `##`）
   * @param msg
   */
  static getTitleFromMsg(msg:string){
    const m = (msg || "").match(/^#\s+(?!#)(.+?)(?:\r?\n|$)/);
    return m ? m[1].trim() : "";
  }

  /**
   * 去掉文首一级标题，保留章节。禁止用 "# "+title 做全局替换（会误伤「## 章节」）。
   */
  static getContentFromMsg=(msg:string)=>{
    return (msg || "").replace(/^#\s+(?!#).*(?:\r?\n+|$)/, "").trim();
  }

  /**
   * 从大纲内容中获取 DOC 章/段树；状态机优先识别 ```table/figure，
   * 避免表格行被 paragraphRegex2（`|*+-`）误收成假段落（七·3）。
   */
  static getChaptersFromContent(content:string):Chapter[]{
    const chapters: Chapter[] = [];
    let currentChapter: Chapter | null = null;
    let currentParagraph: Paragraph | null = null;
    lastDocTitleDemotions = [];

    const chapterRegex = /^## (.+)$/;
    // ### 必须负向排除 ####（否则会被吃成段题）
    const paragraphRegex1 = /^###(?!#) (.+)$/;
    const paragraphRegex2 = /^[*|+-] (.+)$/;
    const pointRegex = /^#### (.+)$/;

    const lines = preprocessDegradedFences(content).split('\n');
    let chapterIndex=1;
    let paragraphIndex=1;
    /** 十四·3.1：本章已经出现过 ### 之后，* / - / + 归入当前段的 points */
    let chapterSawH3 = false;
    let state: "normal" | "table" | "figure" | "unknown" = "normal";
    let fenceBuf: string[] = [];

    const flushFence = () => {
      if (state === "table" || state === "figure") {
        const block =
          state === "table"
            ? parseTableFenceLines(fenceBuf)
            : parseFigureFenceLines(fenceBuf);
        if (block && currentParagraph) {
          currentParagraph.blocks.push(block);
        }
      }
      fenceBuf = [];
      state = "normal";
    };

    /** 十三·B：保证有当前段，再挂 #### / 降级子点 */
    const appendPointToCurrent = (label: string) => {
      if (!currentChapter) return;
      if (!currentParagraph) {
        const p = new Paragraph(paragraphIndex, "要点");
        p.heading = false;
        paragraphIndex++;
        currentChapter.paragraphs.push(p);
        currentParagraph = p;
      }
      currentParagraph.points.push({label});
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (state !== "normal") {
        if (FENCE_END.test(trimmed)) {
          flushFence();
        } else {
          const nested = matchFenceOpen(trimmed);
          if (nested) {
            flushFence();
            state = nested.kind;
            fenceBuf = [];
            seedFenceBuffer(nested.kind, nested.rest, fenceBuf);
          } else if (state !== "unknown") {
            fenceBuf.push(line);
          }
        }
        continue;
      }
      if (FENCE_END.test(trimmed)) {
        continue;
      }
      const fenceOpen = matchFenceOpen(trimmed);
      if (fenceOpen) {
        state = fenceOpen.kind;
        fenceBuf = [];
        seedFenceBuffer(fenceOpen.kind, fenceOpen.rest, fenceBuf);
        continue;
      }
      if (/^```/.test(trimmed)) {
        // 孤立/未知围栏：吞掉直到闭合，不参与段落识别
        state = "unknown";
        fenceBuf = [];
        continue;
      }
      // PPT 元数据行：永不产生段落（八·2）
      if (DOC_META_LINE.test(trimmed)) continue;

      const chapterMatch = trimmed.match(chapterRegex);
      const pointMatch = trimmed.match(pointRegex);
      const paragraphMatch1 = trimmed.match(paragraphRegex1);
      const paragraphMatch2 = trimmed.match(paragraphRegex2);

      if (chapterMatch) {
        if (currentChapter) {
          chapters.push(currentChapter);
        }
        currentChapter = new Chapter(chapterIndex, cleanString(chapterMatch[1]));
        currentParagraph = null;
        chapterSawH3 = false;
        chapterIndex++;
      } else if (pointMatch && currentChapter) {
        // 十三·B：#### 子点挂到当前段（允许数字/引注）
        appendPointToCurrent(cleanString(pointMatch[1]) || pointMatch[1]);
      } else if (paragraphMatch2 && currentChapter && chapterSawH3) {
        const cleaned = cleanString(paragraphMatch2[1]);
        appendPointToCurrent(cleaned || paragraphMatch2[1]);
      } else if ((paragraphMatch1 || paragraphMatch2) && currentChapter) {
        let paragraphTitle = "";
        if (paragraphMatch1) {
          paragraphTitle = paragraphMatch1[1];
          chapterSawH3 = true;
        } else if (paragraphMatch2) {
          paragraphTitle = paragraphMatch2[1];
        }
        // 十三·A/B：数据句段题不占 h2 → 降为 #### 子点 + Warn
        if (paragraphMatch1 && isDataLikeDocParagraphTitle(paragraphTitle)) {
          const cleaned = cleanString(paragraphTitle);
          lastDocTitleDemotions.push(cleaned || paragraphTitle);
          appendPointToCurrent(cleaned || paragraphTitle);
          continue;
        }
        const paragraph = new Paragraph(paragraphIndex, cleanString(paragraphTitle));
        paragraph.heading = !!paragraphMatch1;
        paragraphIndex++;
        currentChapter.paragraphs.push(paragraph);
        currentParagraph = paragraph;
      }
    }
    if (state !== "normal") flushFence();
    if (currentChapter) {
      chapters.push(currentChapter);
    }
    return chapters;
  }


  /**
   * 检查文章大纲格式。code：0 通过；>0 Warn 可保存；<0 拒收（八·3）。
   */
  static checkChapter(chapters:Array<Chapter>):CheckMsg{
    const depth = normalizeDocDepth(chapters || [], {maxLevel: 3});
    if (!chapters || chapters.length==0) {
      return {code:-1,msg:"大纲格式不正确，没有发现任何章节，章节前缀应该为【## 】，注意空格"};
    }
    if (chapters.length < 2) {
      return {code:-3,msg:`文章大纲章节过少（当前 ${chapters.length} 章），请写 3～5 章（推荐 4）。`};
    }
    if (chapters.length > 6) {
      return {code:-3,msg:`文章大纲章节过多（当前 ${chapters.length} 章），请压缩为 3～5 章（最多 6）。`};
    }
    let paragraphsCnt=0
    const warns: string[] = [...depth.notes];
    for (let i=0;i<chapters.length;i++) {
      const paragraphs=chapters[i].paragraphs;
      if (chapters[i].collapsed) {
        paragraphsCnt += paragraphs?.length || 0;
        continue;
      }
      if(!paragraphs || paragraphs.length==0){
        return {code:-2,msg:`大纲格式不正确，第${i+1}章没发现任何段落，段落标题前缀应为【### 】（* + - 为兼容写法，推荐 ###），注意空格。`}
      }
      const headingCnt = paragraphs.filter((p) => p.heading).length;
      if (headingCnt === 0) {
        warns.push(
          `第${i + 1}章未使用【### 】段落标记（检测到 ${paragraphs.length} 行 */- 开头）。已按段落理解；建议重新生成或手工改为【### 】。`,
        );
      } else {
        // 十三·A：段题数据句降级后可能只剩 1 个 ###；对齐「降级 Warn 不拒单」，勿因降级误杀
        if (headingCnt < 2) {
          if (lastDocTitleDemotions.length) {
            warns.push(
              `第${i + 1}章有效 ### 偏少（当前 ${headingCnt}，建议 2～4）；部分段题已按数据句降级为 #### 子点。`,
            );
          } else {
            return {code:-2,msg:`第${i+1}章段落过少（须 2～4 个 ### 段落，当前 ${headingCnt}）。`};
          }
        }
        if (headingCnt > 6) {
          return {code:-2,msg:`第${i+1}章段落过多（当前 ${headingCnt} 个 ###，请压到 2～4，最多 6）。`};
        }
      }
      paragraphsCnt+=paragraphs.length;
    }
    // 九·3 / 十一·3：末章宜为结论类（Warn 不拒单）
    const lastCh = chapters[chapters.length - 1];
    if (lastCh && !DOC_CONCLUSION_CHAPTER_RE.test(lastCh.title || "")) {
      warns.push(
        `末章「${lastCh.title}」不像结论/建议类；建议增加结论章或改末章题（含「结论/建议/动作」等）。`,
      );
    }
    // 十三·A：段题数据句降级 Warn（读完即清空，避免串测）
    const demotions = [...lastDocTitleDemotions];
    lastDocTitleDemotions = [];
    if (demotions.length) {
      const sample = demotions.slice(0, 3).join(" / ");
      warns.push(
        `有 ${demotions.length} 条段题像数据句（过长/含数字/引注），已降级为 #### 子点（例：${sample}）。`,
      );
    }
    // 十一·3 / 9.4：段题互斥（Warn 不拒单）
    const overlaps = findOverlappingParagraphTitles(chapters);
    for (const o of overlaps.slice(0, 3)) {
      warns.push(
        `段题过近：「${o.a}」与「${o.b}」可能重复展开同一主题（骨架要求同级标题互不重复）。`,
      );
    }
    if (warns.length) {
      return {
        code: 1,
        msg: `大纲可保存，但标记不规范：${warns.join(" ")}（共 ${chapters.length} 章 / ${paragraphsCnt} 段）`,
      };
    }
    return {code:0, msg:`大纲格式正确，一共发现${chapters.length}章，共计${paragraphsCnt}个段落。`}
  }
  /**
   * 通过给一个key，获取{章节key,段落key}
   * @param chapters
   * @param key
   * @return ("chapter-1","paragraph-2")
   * //TODO 该方案不行：若chapters空或paragraph为空，返回undefined，必须前端保证第一章第一节有内容
   */
  static getKeysFromKey(chapters:Array<Chapter>,key:string){
    if (!chapters?.length) {
      return undefined;
    }
    for (let chapter of chapters) {
      if(chapter.key===key){
        if (!chapter.paragraphs?.length) {
          return undefined;
        }
        return new DocKeys(key,chapter.paragraphs[0].key)
      }else{
        const paragraphs=chapter.paragraphs;
        if (Array.isArray(paragraphs)) {
          for(let paragraph of paragraphs) {
            if(paragraph.key===key){
              return new DocKeys(chapter.key,key);
            }
          }
        }
      }
    }
    if(!chapters[0].paragraphs?.length){
      return undefined;
    }else {
      return new DocKeys(chapters[0].key, chapters[0].paragraphs[0].key)
    }
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
        // chapter.setPrompt(prompt); //章节本身暂时不需要设置提示词
        return;
      }else{
        const paragraphs = chapter.paragraphs;
        if (Array.isArray(paragraphs)) {
          for (let paragraph of paragraphs) {
            if(paragraph.key===key){
              paragraph.setPrompt(prompt);
              return;
            }
          }
        }
      }
    }
    console.log(`给key：${key}项设置提示词时出错。找不到key值`);
  }
  /**
   * 为一个文档大纲的所有段落初始化提示词。
   * format_prompt：段落写作契约（字数/禁套话）；由 buildDocParagraphFormatPrompt 提供。
   * ctx：岗位 / 章问题 / 相邻段边界 / 结论归属（十一·3 / 9.1）。
   */
  static setAllPrompt(
    chapters: Chapter[],
    pptTitle: string,
    format_prompt: string = "",
    ctx?: DocParagraphPromptCtx,
  ) {
    const fmt = (format_prompt || "").trim();
    const role =
      (ctx?.role || "").trim() || inferDocWritingRole(pptTitle);
    normalizeDocDepth(chapters, {maxLevel: ctx?.maxLevel ?? 3});
    for (const chapter of chapters) {
      if (chapter.collapsed && chapter.paragraphs.length === 0) {
        const p = new Paragraph(1, chapter.title);
        p.heading = true;
        p.level = 2;
        p.points = [...(chapter.points || [])];
        p.pointGuide = chapter.pointGuide || "";
        chapter.paragraphs.push(p);
      }
    }
    const nCh = chapters.length;
    for (let ci = 0; ci < nCh; ci++) {
      const chapter = chapters[ci];
      const paragraphs = chapter.paragraphs;
      if (!Array.isArray(paragraphs)) continue;
      const isConclusionChapter =
        ci === nCh - 1 || DOC_CONCLUSION_CHAPTER_RE.test(chapter.title || "");
      const useHeading = paragraphs.some((p) => p.heading);
      for (const paragraph of paragraphs) {
        if (paragraph.isContainer()) continue;
        const siblings = paragraphs
          .filter(
            (p) =>
              p !== paragraph &&
              !p.isContainer() &&
              (!useHeading || p.heading),
          )
          .map((p) => p.title)
          .filter(Boolean);
        // 十七·2：按要点数算单值预算（勿传旧 wordBudget，否则不会重算）
        paragraph.wordBudget = wordBudgetFor({
          heading: paragraph.heading,
          container: paragraph.container,
          points: paragraph.points,
          pointGuide: paragraph.pointGuide,
          prompt: paragraph.prompt,
        });
        paragraph.role = role;
        paragraph.question =
          `围绕「${chapter.title}」说明本段「${paragraph.title}」对该问题的贡献`;
        paragraph.allowTable = true;
        paragraph.allowFigure = ctx?.allowFigure !== false;
        paragraph.promptManual = false;
        // format_prompt 第三参已弃用：字数/表图契约一律由 assemble 按段预算拼，避免全局硬编码覆盖
        void fmt;
        const prompt = assembleDocParagraphPrompt(paragraph, {
          docTitle: (pptTitle || "").trim() || "未命名文档",
          chapterTitle: chapter.title,
          siblings,
          isConclusionChapter,
          includeFormat: true,
        });
        paragraph.setPrompt(prompt);
      }
    }
    return chapters;
  }

  /**
   * 为一个文档大纲的某段落设置生成内容。
   * @param chapters
   * @param key
   * @param content
   */
  static setContent(chapters: Chapter[], key: string, content: string) {
    let paragraph=this.getParagraph(chapters,key);
    if(paragraph!==undefined){
      paragraph.setContent(content);
    }else{
      console.log(`出错了。找不到${key}对应的幻灯片`)
    }
  }

  /**
   * 根据key获取某个段落的内容。
   * @param chapters
   * @param key
   * @return 如果是chapterKey，返回undefined；如果是paragraphKey，返回的是具体paragraph对象
   */
  static getParagraph(chapters: Chapter[], key: string) {
    for (let chapter of chapters) {
      if (chapter.key === key) {
        // chapter.setContent(content);
        return;
      } else {
        const paragraphs = chapter.paragraphs;
        if (Array.isArray(paragraphs)) {
          for (let paragraph of paragraphs) {
            if (paragraph.key === key) {
              return paragraph;
            }
          }
        }
      }
    }
  }

  /**
   * * 将完整规范（经过检查的）的markdown大纲文档存入storage的分类记录集(比如AiDoc_outlineRecs)中
   * @param markdown  markdown大纲内容
   // * @param outlineRecs  已取出的大纲记录集
   * @param outlineType 可能得类型是outlineTypeDOC，outlineTypeAiDOC
   */
  static addDocOutlineRecToStorage(outlineType:outlineType, markdown:string, kbName:string = "samples"){
    const rawTitle=Doc.getTitleFromMsg(markdown);
    const rawContent =Doc.getContentFromMsg(markdown);
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
    let chapters =Doc.getChaptersFromContent(or.outlineContent);
    // 二十一·9：Ai 页无图资产 → allowFigure=false，从源头禁 figure 围栏
    chapters = Doc.setAllPrompt(chapters, or.outlineName, formatPrompt, {
      role: inferDocWritingRole(or.outlineName || ""),
      allowFigure: outlineType !== "aiDoc",
    });
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
  static clearParagraphContent(chapters:Chapter[]) {
    for (let chapter of chapters) {
      const paragraphs = chapter.paragraphs;
      if (Array.isArray(paragraphs)) {
        for (let slide of paragraphs) {
          slide.content="";
        }
      }
    }
  }

}

