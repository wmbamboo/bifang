import {
  Chapter,
  Slide,
  SlideLayout,
  formatSlideTips,
  inferSlideLayout,
  parseSlideTips,
  parseColumnBlocks,
  ColumnBlock,
  deriveSlideTitleFromTips,
} from "@/components/DocUtil/ViewItem4Ppt";

function normalizeLayout(layout: SlideLayout | string | undefined): SlideLayout {
  if (
    layout === "metric" ||
    layout === "metric_list" ||
    layout === "list" ||
    layout === "columns" ||
    layout === "metric_columns"
  ) {
    return layout;
  }
  return "list";
}

function formatColumnBlocks(cols: ColumnBlock[]): string[] {
  const lines: string[] = [];
  for (const col of cols || []) {
    if (!(col.title || "").trim() && !(col.items || []).length) continue;
    lines.push(`col: ${(col.title || "").trim() || "未命名栏"}`);
    if ((col.sub || "").trim()) lines.push(`colSub: ${col.sub.trim()}`);
    for (const item of col.items || []) {
      const t = (item || "").trim();
      if (t) lines.push(t);
    }
  }
  return lines;
}

export {formatColumnBlocks};

/** 按栏结构写入大纲要点（col: / colSub: / 短条目）。 */
export function setColumnTips(slide: Slide, cols: ColumnBlock[], layout: "columns" | "metric_columns" = "columns") {
  slide.layout = layout;
  const colLines = formatColumnBlocks(cols);
  if (layout === "metric_columns") {
    const tips = parseSlideTips(slide.subTitle || "");
    const metrics = tips.filter((t) => t.role === "metric").map((t) => `metric: ${t.text}`);
    slide.subTitle = [...metrics, ...colLines].join("\n");
    return;
  }
  slide.subTitle = colLines.join("\n");
}

/** 把结构化章节写回 Markdown。layout 行由系统写入，用户侧树编辑器不展示原文。 */
export function chaptersToMarkdown(title: string, chapters: Chapter[]): string {
  const lines: string[] = [`# ${(title || "").trim() || "未命名大纲"}`];
  for (const chapter of chapters || []) {
    lines.push("");
    lines.push(`## ${(chapter.title || "").trim() || "未命名章节"}`);
    const chapterSub = (chapter.subTitle || "").trim();
    if (chapterSub) lines.push(`- chapterSub: ${chapterSub}`);
    for (const slide of chapter.slides || []) {
      lines.push("");
      let slideTitle = (slide.title || "").trim();
      if (!slideTitle || slideTitle === "未命名幻灯片") {
        slideTitle =
          deriveSlideTitleFromTips(slide.subTitle || "", slide.layout) || "内容要点";
      }
      lines.push(`### ${slideTitle}`);
      const layout = normalizeLayout(slide.layout);
      lines.push(`- layout: ${layout}`);
      const tips = parseSlideTips(slide.subTitle || "");
      if (layout === "metric_list") {
        for (const tip of tips) {
          lines.push(`- ${tip.role}: ${tip.text}`);
        }
      } else if (layout === "columns") {
        const cols = parseColumnBlocks(slide.subTitle || "");
        if (cols.length) {
          for (const line of formatColumnBlocks(cols)) {
            lines.push(`- ${line}`);
          }
        } else {
          for (const tip of tips) {
            lines.push(`- ${tip.text}`);
          }
        }
      } else if (layout === "metric_columns") {
        for (const tip of tips.filter((t) => t.role === "metric")) {
          lines.push(`- metric: ${tip.text}`);
        }
        const cols = parseColumnBlocks(slide.subTitle || "");
        if (cols.length) {
          for (const line of formatColumnBlocks(cols)) {
            lines.push(`- ${line}`);
          }
        } else {
          for (const tip of tips.filter((t) => t.role === "list")) {
            lines.push(`- ${tip.text}`);
          }
        }
      } else {
        for (const tip of tips) {
          lines.push(`- ${tip.text}`);
        }
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** 解析后按当前要点重算 layout（编辑要点后调用）。 */
export function refreshSlideLayouts(chapters: Chapter[]): Chapter[] {
  for (const chapter of chapters || []) {
    for (const slide of chapter.slides || []) {
      const tips = (slide.subTitle || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (
        slide.layout === "metric" ||
        slide.layout === "list" ||
        slide.layout === "metric_list" ||
        slide.layout === "columns" ||
        slide.layout === "metric_columns"
      ) {
        continue;
      }
      slide.layout = inferSlideLayout(tips);
    }
  }
  return chapters;
}

export function setSlideTips(slide: Slide, tips: string[]) {
  const cleaned = (tips || []).map((t) => t.trim()).filter(Boolean);
  slide.subTitle = cleaned.join("\n");
}

/** 按角色写入复合页要点（自动带 metric:/list: 前缀）。 */
export function setMetricListTips(slide: Slide, metrics: string[], lists: string[]) {
  if (slide.layout === "metric_columns") {
    const cols = parseColumnBlocks(slide.subTitle || "");
    const metricLines = (metrics || [])
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => `metric: ${t}`);
    slide.subTitle = [...metricLines, ...formatColumnBlocks(cols)].join("\n");
    return;
  }
  slide.layout = "metric_list";
  slide.subTitle = formatSlideTips([
    ...metrics.map((text) => ({ role: "metric" as const, text })),
    ...lists.map((text) => ({ role: "list" as const, text })),
  ]);
}

export function layoutLabel(layout: SlideLayout | string | undefined): string {
  if (layout === "metric") return "数据卡";
  if (layout === "metric_list") return "数据卡+要点";
  if (layout === "columns") return "分栏";
  if (layout === "metric_columns") return "数据卡+分栏";
  if (layout === "table") return "表格";
  if (layout === "image_grid") return "图鉴";
  return "列表";
}
