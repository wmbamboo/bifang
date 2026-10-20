/**
 * 十五·3.2：把任意层数压进现有章/段模型。纯函数，不 import 服务。
 * R4 空洞剔除 → R1 单子塌陷 → R3 过宽只 Warn → R2 超深子点折进写作提示。
 */
import type {Chapter} from "@/components/DocUtil/ViewItem4Doc";

export interface DocDepthOpts {
  /** 体裁轴上界 */
  maxLevel: number;
  targetDepth?: number;
  minSiblings?: number;
  maxSiblings?: number;
}

const EMPTY_TITLE = /^(概述|小结|其他|背景|说明|前言)$/;

function pointLine(labels: string[]): string {
  return `【本段要点】${labels.join("、")}`;
}

export function countDocGenerationUnits(chapters: Chapter[]): number {
  let n = 0;
  for (const ch of chapters || []) {
    if (ch.collapsed && (ch.paragraphs || []).length === 0) {
      n += 1;
      continue;
    }
    const paras = ch.paragraphs || [];
    const headings = paras.filter((p) => p.heading && !p.container);
    n += headings.length || paras.filter((p) => !p.container).length;
  }
  return n;
}

export function normalizeDocDepth(
  chapters: Chapter[],
  opts: DocDepthOpts,
): {chapters: Chapter[]; notes: string[]} {
  const maxLevel = opts.maxLevel ?? 3;
  const maxSiblings = opts.maxSiblings ?? 6;
  const notes: string[] = [];
  const foldPoints = 4 > maxLevel;

  for (const ch of chapters || []) {
    if (ch.collapsed) continue;
    ch.paragraphs = (ch.paragraphs || []).filter((p) => {
      const bare =
        EMPTY_TITLE.test(String(p.title || "").trim()) &&
        (p.points || []).length === 0 &&
        !String(p.content || "").trim() &&
        (p.blocks || []).length === 0;
      if (bare) {
        notes.push(`已去掉空壳段「${p.title}」。`);
        return false;
      }
      return true;
    });

    if (ch.paragraphs.length === 1) {
      const only = ch.paragraphs[0];
      ch.points = [...(only.points || [])];
      ch.collapsed = true;
      ch.paragraphs = [];
      if (foldPoints && ch.points.length) {
        ch.pointGuide = pointLine(ch.points.map((p) => p.label).filter(Boolean));
        ch.points = [];
      }
      notes.push(`「${ch.title}」仅有 1 个子节点，已塌陷为章级生成单元。`);
      continue;
    }

    if (ch.paragraphs.length > maxSiblings) {
      notes.push(
        `「${ch.title}」有 ${ch.paragraphs.length} 个子节点，超过 ${maxSiblings}，请重出大纲再分层（不自动拆章）。`,
      );
    }

    if (foldPoints) {
      for (const p of ch.paragraphs) {
        const labels = (p.points || []).map((pt) => pt.label).filter(Boolean);
        if (!labels.length) continue;
        p.pointGuide = pointLine(labels);
        p.points = [];
      }
    }
  }

  return {chapters, notes};
}

/** 导出前给章/段 label 加 1 / 1.1 前缀。已有前缀则不重复。不写回 prompt。 */
export function applyDocHeadingNumbers(chapters: Chapter[]): void {
  (chapters || []).forEach((ch, i) => {
    const cn = i + 1;
    const baseCh = String(ch.title || ch.label || "").replace(/^\d+\s+/, "");
    ch.label = `${cn} ${baseCh}`.trim();
    let pn = 0;
    for (const p of ch.paragraphs || []) {
      if (p.container) continue;
      pn += 1;
      const base = String(p.title || p.label || "").replace(/^\d+\.\d+\s+/, "");
      p.label = `${cn}.${pn} ${base}`.trim();
    }
  });
}
