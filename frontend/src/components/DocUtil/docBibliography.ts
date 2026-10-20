/**
 * 二十九·P0 / 三十·⑤：文末「资料来源」清单。
 * 从生成阶段 docs（后端 ref_docs）聚合去重文件名 + 页码；
 * 导出时 append 到 document.xml，不进 chapters（避免「5 资料来源」）。
 */
import type PizZip from "pizzip";

export type DocRefSourceRow = {
  source?: string;
  title?: string;
  page?: string | number | null;
};

export type BibliographyEntry = {
  source: string;
  pages: number[];
};

/** 合并一段响应里的 docs 到 Map<source, Set<page>> */
export function accumulateRefDocs(
  bag: Map<string, Set<number>>,
  docs: DocRefSourceRow[] | unknown,
): void {
  if (!Array.isArray(docs)) return;
  for (const d of docs) {
    const src = String(d?.source || d?.title || "")
      .trim()
      .replace(/^.*[/\\]/, "");
    if (!src || src === "未知文档") continue;
    let pages = bag.get(src);
    if (!pages) {
      pages = new Set<number>();
      bag.set(src, pages);
    }
    const p = d?.page;
    if (p != null && p !== "" && Number.isFinite(Number(p))) {
      pages.add(Number(p));
    }
  }
}

export function bibliographyFromBag(
  bag: Map<string, Set<number>>,
): BibliographyEntry[] {
  const out: BibliographyEntry[] = [];
  for (const [source, pages] of bag) {
    out.push({
      source,
      pages: [...pages].sort((a, b) => a - b),
    });
  }
  out.sort((a, b) => a.source.localeCompare(b.source, "zh"));
  return out;
}

function xmlEscape(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPages(pages: number[]): string {
  if (!pages.length) return "";
  return `（第 ${pages.join("、")} 页）`;
}

/**
 * 在 stripHeadingAutoNumbering 之后调用：插在 body 末尾、sectPr 之前。
 * 样式用 Normal，手写「资料来源」标题，不进 TOC/chapters。
 */
export function appendDocBibliography(
  zip: PizZip,
  entries: BibliographyEntry[],
): boolean {
  if (!entries.length) return false;
  const docFile = zip.file("word/document.xml");
  if (!docFile) return false;
  let xml = docFile.asText();
  const lines = entries.map((e) => {
    const pagePart = formatPages(e.pages);
    return (
      `<w:p>` +
      `<w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr>` +
      `<w:r><w:t xml:space="preserve">· ${xmlEscape(e.source)}${xmlEscape(pagePart)}</w:t></w:r>` +
      `</w:p>`
    );
  });
  const block =
    `<w:p><w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>` +
    `<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>资料来源</w:t></w:r></w:p>` +
    lines.join("");
  const sect = xml.lastIndexOf("<w:sectPr");
  if (sect < 0) {
    xml = xml.replace(/<\/w:body>/, `${block}</w:body>`);
  } else {
    xml = xml.slice(0, sect) + block + xml.slice(sect);
  }
  zip.file("word/document.xml", xml);
  return true;
}
