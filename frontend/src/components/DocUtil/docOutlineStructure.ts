/**
 * Word 大纲的**结构化视图模型**（纯函数，无 React/antd 依赖，便于单测）。
 *
 * 用途：大纲查询/选择抽屉右侧「大纲内容」把 markdown 大纲渲染成 章→段→子点 结构，
 * 让层级可见（此前是 `Typography + react-markdown` 裸渲染，章/段/要点几乎无差别）。
 *
 * 注意：解析**不做 cleanString 清洗**——`ViewItem4Doc.cleanString` 会吃掉阿拉伯数字
 * 与部分字母（标题丢字 B1），视图必须显示大纲原文，否则用户看到的与存储的不一致。
 *
 * 与 `ViewItem4Doc.getChaptersFromContent` 的口径保持一致：
 * `## ` = 章，`### ` = 段，`#### ` = 子点（十三·B），`* - +` = 段（兼容写法，标 heading=false），
 * ` ```table` / ` ```figure` 围栏归属到所在段，PPT 元数据行丢弃。
 */

export type DocOutlinePara = {
  key: string;
  /** 视图编号：1.1 / 1.2 …（与原文手写序号无关） */
  no: string;
  title: string;
  /** 由 `### ` 产生为 true；由 `* - +` 兼容写法产生为 false */
  heading: boolean;
  /** `####` 子点（数据点/对照点） */
  points: string[];
  bullets: string[];
  hasTable: boolean;
  hasFigure: boolean;
};

export type DocOutlineChap = {
  key: string;
  no: number;
  title: string;
  paras: DocOutlinePara[];
};

export type DocOutlineDoc = {
  title: string;
  chapters: DocOutlineChap[];
  /** 未落在任何章节下的散行 */
  loose: string[];
  paraTotal: number;
  charTotal: number;
};

const RE_H1 = /^#(?!#)\s+(.+)$/;
const RE_H2 = /^##(?!#)\s+(.+)$/;
const RE_H3 = /^###(?!#)\s+(.+)$/;
const RE_H4 = /^####\s+(.+)$/;
const RE_BULLET = /^[*+\-]\s+(.+)$/;
const RE_FENCE_OPEN = /^```\s*([A-Za-z]*)\s*$/;
const RE_FENCE_CLOSE = /^```\s*$/;
/** PPT 元数据行：视图不显示（与八·2 解析层过滤一致） */
const RE_META = /^[*+\-]\s*(layout|tips|intent|版式|类型|备注|页数)\s*[:：]/i;

/** 去掉手写序号，避免与视图编号重复：第X章 / 一、 / 1. / 1.1 / （一） / ①
 *  注意：只有在「点号编号」或「数字后紧跟分隔符」时才剥数字，
 *  否则会把「2024年男装趋势」剥成「年男装趋势」（与标题丢字 B1 同类错误）。 */
export const stripDocOutlineOrdinal = (s: string): string =>
  String(s || "")
    .replace(
      /^第\s*[一二三四五六七八九十百零〇两\d]+\s*[章节段部分]\s*[：:\-—–．.、]?\s*/u,
      "",
    )
    .replace(/^Chapter\s*\d+\s*[:：.\-—–]?\s*/i, "")
    .replace(/^[（(]\s*[一二三四五六七八九十\d]+\s*[)）]\s*/u, "")
    .replace(/^[一二三四五六七八九十]+\s*[、.．]\s*/u, "")
    .replace(/^\d+(?:\.\d+)+\s*[、.．:：\-]?\s*/u, "")
    .replace(/^\d+\s*[、.．:：]\s*/u, "")
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/u, "")
    .replace(/^(?:[IVXLC]{1,6})\s*[、.．:：\-]?\s*/i, "")
    .trim();

export function parseDocOutlineMarkdown(
  markdown: string,
  fallbackTitle = "",
): DocOutlineDoc {
  const text = String(markdown || "").replace(/\r\n?/g, "\n");
  const chapters: DocOutlineChap[] = [];
  const loose: string[] = [];
  let title = "";
  let curChap: DocOutlineChap | null = null;
  let curPara: DocOutlinePara | null = null;
  let chapSeq = 0;
  let paraSeq = 0;

  type Fence = "table" | "figure" | "unknown" | null;
  let fence: Fence = null;

  const pushChap = (raw: string) => {
    chapSeq += 1;
    curChap = {key: `c${chapSeq}`, no: chapSeq, title: raw.trim(), paras: []};
    chapters.push(curChap);
    paraSeq = 0;
    curPara = null;
  };

  const pushPara = (raw: string, heading: boolean) => {
    const chap = curChap;
    if (!chap) {
      loose.push(raw.trim());
      return;
    }
    paraSeq += 1;
    const para: DocOutlinePara = {
      key: `c${chapSeq}p${paraSeq}`,
      no: `${chapSeq}.${paraSeq}`,
      title: raw.trim(),
      heading,
      points: [],
      bullets: [],
      hasTable: false,
      hasFigure: false,
    };
    curPara = para;
    chap.paras.push(para);
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (fence) {
      if (RE_FENCE_CLOSE.test(line)) {
        if (curPara) {
          if (fence === "table") curPara.hasTable = true;
          if (fence === "figure") curPara.hasFigure = true;
        }
        fence = null;
      }
      continue;
    }
    if (!line) continue;

    const fenceOpen = line.match(RE_FENCE_OPEN);
    if (fenceOpen) {
      const lang = (fenceOpen[1] || "").toLowerCase();
      fence = lang === "table" ? "table" : lang === "figure" ? "figure" : "unknown";
      continue;
    }
    if (RE_META.test(line)) continue;

    const h1 = line.match(RE_H1);
    if (h1) {
      title = h1[1].trim();
      continue;
    }
    const h2 = line.match(RE_H2);
    if (h2) {
      pushChap(h2[1]);
      continue;
    }
    // #### 须先于 ###（否则会被 ### 吞）
    const h4 = line.match(RE_H4);
    if (h4) {
      if (curPara) curPara.points.push(h4[1].trim());
      else loose.push(h4[1].trim());
      continue;
    }
    const h3 = line.match(RE_H3);
    if (h3) {
      pushPara(h3[1], true);
      continue;
    }
    const bullet = line.match(RE_BULLET);
    if (bullet) {
      // 段已由 `### ` 建立 → 归为该段下的要点；否则按兼容写法视作一个段
      if (curPara && curPara.heading) curPara.bullets.push(bullet[1].trim());
      else pushPara(bullet[1], false);
      continue;
    }
    if (curPara) curPara.bullets.push(line);
    else loose.push(line);
  }

  const paraTotal = chapters.reduce((n, c) => n + c.paras.length, 0);
  const charTotal = chapters.reduce(
    (n, c) => n + c.title.length + c.paras.reduce((m, p) => m + p.title.length, 0),
    0,
  );

  return {
    title: title || (fallbackTitle || "").trim(),
    chapters,
    loose,
    paraTotal,
    charTotal,
  };
}
