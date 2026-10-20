/**
 * Word 渲染后注入段落级表/图（七·6）。
 * 就地修改 PizZip；不依赖 docxtemplater image module。
 * 取 KB 字节由调用方注入（九·9·1），本文件不顶层 import kb 服务。
 */
import type PizZip from "pizzip";
import {readImageSize} from "@/components/DocUtil/imageBufferMeta";
import type {DocBlock, Chapter} from "@/components/DocUtil/ViewItem4Doc";
import {absorbBlocksFromParagraphContent} from "@/components/DocUtil/ViewItem4Doc";
import {
  extractMetricTokens,
  evidenceHasMetric,
  isPriceBandBoundToken,
} from "@/components/DocUtil/outlineEvidenceValidate";
import {normalizeKbAssetRef} from "@/components/DocUtil/docFigureAssets";

const DOCBLOCK_MARK = "⟦DOCBLOCK⟧";
const PAGE_W_EMU = 5400675;
const PAGE_H_EMU = 8533130;
/** 单图体积闸；超限先降采样，仍超才 missing */
export const MAX_IMG_BYTES = 1.5 * 1024 * 1024;
export const MAX_TOTAL_IMG_BYTES = 30 * 1024 * 1024;
/** 降采样宽上限（约版心 2×@96dpi） */
const RESIZE_MAX_W = 1200;
const RESIZE_JPEG_Q = 0.85;

export type FetchKbAssetBytes = (args: {
  kbName: string;
  file_name: string;
  asset_id: string;
}) => Promise<ArrayBuffer>;

export type ResolveUploadBytes = (
  fileKey: string,
) => Promise<{bytes: ArrayBuffer; mime?: string} | null>;

export type DocBlockResolveOpts = {
  kbName?: string;
  resolveUpload?: ResolveUploadBytes;
  /** 注入取图；缺省则 kb: 全部降级为缺失（测试/离线） */
  fetchKbAsset?: FetchKbAssetBytes;
  /** 九·5：有证据时校验表内数字；无证据则不过闸 */
  evidenceText?: string;
  /**
   * 二十三·13：可用 ref 白名单（formatKbAssetRef 输出）。
   * 归一化后精确匹配才取图；不命中 → figure-blocked（保留 caption）。
   * 空集合 = 禁全部 figure（Ai / 无资产段）。
   */
  allowedFigureRefs?: Set<string> | string[];
  /**
   * 与 blockLists 同序的段级白名单；某项为 undefined 则回退到 allowedFigureRefs；
   * 某项为空数组/空 Set = 该段禁图。
   */
  allowedFigureRefsByList?: Array<Set<string> | string[] | undefined | null>;
  /**
   * 二十五·1：超体积降采样。缺省用 defaultResizeImage；
   * 测试可注入 fake（jsdom 无 OffscreenCanvas）。
   */
  resizeImage?: ResizeImageFn;
};

export type ResizeImageFn = (
  bytes: Uint8Array,
  mime: string,
  maxW: number,
  quality: number,
) => Promise<{bytes: Uint8Array; mime: string; w: number; h: number} | null>;

/** 浏览器侧默认降采样：createImageBitmap → OffscreenCanvas → JPEG */
export const defaultResizeImage: ResizeImageFn = async (
  bytes,
  mime,
  maxW = RESIZE_MAX_W,
  q = RESIZE_JPEG_Q,
) => {
  if (
    typeof createImageBitmap !== "function" ||
    typeof OffscreenCanvas === "undefined"
  ) {
    return null;
  }
  try {
    const blob = new Blob(
      [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)],
      {type: mime || "image/png"},
    );
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxW / Math.max(1, bmp.width));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const cv = new OffscreenCanvas(w, h);
    const ctx = cv.getContext("2d");
    if (!ctx) {
      bmp.close?.();
      return null;
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    const out = await cv.convertToBlob({type: "image/jpeg", quality: q});
    const buf = new Uint8Array(await out.arrayBuffer());
    bmp.close?.();
    return {bytes: buf, mime: "image/jpeg", w, h};
  } catch {
    return null;
  }
};

export type DocBlockPayloadItem =
  | {kind: "table"; caption: string; rows: string[][]}
  | {
      kind: "figure";
      caption: string;
      bytes: Uint8Array;
      mime: string;
      pxW: number;
      pxH: number;
    }
  | {kind: "figure-missing"; caption: string; ref: string}
  /** 二十四·D：白名单拒绝（模型改写 ref），非取字节失败 */
  | {kind: "figure-blocked"; caption: string; ref: string};

function xmlEscape(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 二十五·2：缓存真序号 + begin dirty，避免全是「图 1」 */
function captionParagraph(
  seqName: "表" | "图",
  caption: string,
  seqValue: number,
): string {
  const t = xmlEscape(caption || "");
  const n = Math.max(1, Math.round(seqValue) || 1);
  return (
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="180"/></w:pPr>` +
    `<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>${seqName} </w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> SEQ ${seqName} \\* ARABIC </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t>${n}</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve"> ${t}</w:t></w:r>` +
    `</w:p>`
  );
}

function borderEl(tag: string): string {
  return `<w:${tag} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
}

/** 等比缩放至版心 95% 宽 / 80% 高；不放大小图 */
export function computeInlineEmu(pxW: number, pxH: number): {emuW: number; emuH: number} {
  const safeW = Math.max(1, pxW);
  const safeH = Math.max(1, pxH);
  const maxW = Math.round(PAGE_W_EMU * 0.95);
  let emuW = Math.min(maxW, Math.round((safeW / 96) * 914400));
  let emuH = Math.round((emuW * safeH) / safeW);
  const maxH = Math.round(PAGE_H_EMU * 0.8);
  if (emuH > maxH) {
    emuH = maxH;
    emuW = Math.round((emuH * safeW) / safeH);
  }
  return {emuW, emuH};
}

function buildTableXml(
  caption: string,
  rows: string[][],
  seqValue: number,
): string {
  if (!rows.length) return "";
  const cols = Math.min(5, Math.max(...rows.map((r) => r.length), 1));
  const clipped = rows.slice(0, 8).map((r) => {
    const padded = [...r];
    while (padded.length < cols) padded.push("");
    return padded.slice(0, cols);
  });
  const colW = Math.floor(8505 / cols);
  const grid = Array.from({length: cols}, () => `<w:gridCol w:w="${colW}"/>`).join("");
  const trs = clipped
    .map((row, ri) => {
      const trPr =
        ri === 0
          ? `<w:trPr><w:tblHeader/></w:trPr>`
          : `<w:trPr><w:cantSplit/></w:trPr>`;
      const tcs = row
        .map((cell) => {
          const shd =
            ri === 0
              ? `<w:shd w:val="clear" w:fill="F2F2F2"/>`
              : "";
          const bold = ri === 0 ? `<w:rPr><w:b/></w:rPr>` : "";
          return (
            `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/>${shd}</w:tcPr>` +
            `<w:p><w:r>${bold}<w:t>${xmlEscape(cell)}</w:t></w:r></w:p></w:tc>`
          );
        })
        .join("");
      return `<w:tr>${trPr}${tcs}</w:tr>`;
    })
    .join("");
  const tbl =
    `<w:tbl><w:tblPr>` +
    `<w:tblW w:w="8505" w:type="dxa"/>` +
    `<w:tblBorders>${borderEl("top")}${borderEl("left")}${borderEl("bottom")}${borderEl("right")}` +
    `${borderEl("insideH")}${borderEl("insideV")}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>${trs}</w:tbl>` +
    `<w:p/>`;
  const cap = caption ? captionParagraph("表", caption, seqValue) : "";
  return cap + tbl;
}

function buildFigureXml(
  item: Extract<DocBlockPayloadItem, {kind: "figure"}>,
  rId: string,
  docPrId: number,
  seqValue: number,
): string {
  const {emuW, emuH} = computeInlineEmu(item.pxW, item.pxH);
  const name = `Picture${docPrId}`;
  const descr = xmlEscape(item.caption || "");
  const drawing =
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="60"/></w:pPr>` +
    `<w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:extent cx="${emuW}" cy="${emuH}"/>` +
    `<wp:docPr id="${docPrId}" name="${name}" descr="${descr}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${docPrId}" name="img${docPrId}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/>` +
    `<a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emuW}" cy="${emuH}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  return drawing + captionParagraph("图", item.caption || "", seqValue);
}

/** 二十五·3 / 三十五·4：正文只留人类可读文案；ref 仅 console */
export const UPLOAD_GONE_REF = "__upload_gone__";

function buildMissingFigureXml(
  caption: string,
  ref: string,
  kind: "figure-missing" | "figure-blocked",
  seqValue: number,
): string {
  const label =
    kind === "figure-blocked"
      ? "［图片不可用］"
      : ref === UPLOAD_GONE_REF || /本地上传图已失效/.test(ref)
        ? "［本地上传图已失效，请重新上传］"
        : "［图片缺失］";
  console.warn("[DocBlock]", kind, ref || "(空)", caption || "");
  const msg = xmlEscape(label);
  // 二十八·1 P2：blocked 不挂空题注（避免「图 N …」空挂）
  const capXml =
    kind !== "figure-blocked" && caption
      ? captionParagraph("图", caption, seqValue)
      : "";
  return (
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr>` +
    `<w:r><w:rPr><w:color w:val="C00000"/><w:sz w:val="18"/></w:rPr><w:t>${msg}</w:t></w:r></w:p>` +
    capXml
  );
}

/** 找全部含 ⟦DOCBLOCK⟧ 的段落，按出现顺序返回 [start,end) */
export function findDocBlockAnchors(xml: string): Array<{start: number; end: number}> {
  const out: Array<{start: number; end: number}> = [];
  let from = 0;
  while (true) {
    const mark = xml.indexOf(DOCBLOCK_MARK, from);
    if (mark < 0) break;
    // 自标记向左找本段起点（必须是 <w:p …>，排除 <w:pPr / <w:pgSz 等）
    let pStart = -1;
    let search = mark;
    while (search >= 0) {
      const i = xml.lastIndexOf("<w:p", search);
      if (i < 0) break;
      const next = xml[i + 4];
      if (next === ">" || next === " " || next === "\n" || next === "\r" || next === "\t") {
        pStart = i;
        break;
      }
      search = i - 1;
    }
    const pEndTag = xml.indexOf("</w:p>", mark);
    if (pStart < 0 || pEndTag < 0) break;
    const end = pEndTag + "</w:p>".length;
    out.push({start: pStart, end});
    from = end;
  }
  return out;
}

function ensureImageContentTypes(zip: PizZip): void {
  const path = "[Content_Types].xml";
  const file = zip.file(path);
  if (!file) return;
  let ct = file.asText();
  const addDefault = (ext: string, mime: string) => {
    if (new RegExp(`Extension="${ext}"`, "i").test(ct)) return;
    ct = ct.replace(
      "</Types>",
      `<Default Extension="${ext}" ContentType="${mime}"/></Types>`,
    );
  };
  addDefault("png", "image/png");
  addDefault("jpeg", "image/jpeg");
  addDefault("jpg", "image/jpeg");
  zip.file(path, ct);
}

function nextRelId(relsXml: string): number {
  let max = 0;
  const re = /Id="rId(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(relsXml))) {
    max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

function mimeToExt(mime: string): string {
  if (/jpeg|jpg/i.test(mime)) return "jpeg";
  if (/gif/i.test(mime)) return "gif";
  return "png";
}

/**
 * 渲染后注入。seq 长度必须等于锚点数；null/[] 删除该锚点。
 * 长度不一致时放弃注入，把锚点改为可见提示（七·7）。
 */
export function injectDocBlocks(
  zip: PizZip,
  seq: Array<DocBlockPayloadItem[] | null>,
): {ok: boolean; warning?: string} {
  const docFile = zip.file("word/document.xml");
  if (!docFile) return {ok: false, warning: "无 document.xml"};
  let xml = docFile.asText();
  const anchors = findDocBlockAnchors(xml);
  if (anchors.length !== seq.length) {
    const tip =
      `<w:p><w:r><w:rPr><w:color w:val="C00000"/></w:rPr>` +
      `<w:t>此处有未渲染的块（锚点数 ${anchors.length} ≠ 段落块序列 ${seq.length}）</w:t></w:r></w:p>`;
    // 从后往前替换，避免偏移
    for (let i = anchors.length - 1; i >= 0; i--) {
      const a = anchors[i];
      xml = xml.slice(0, a.start) + tip + xml.slice(a.end);
    }
    zip.file("word/document.xml", xml);
    return {
      ok: false,
      warning: `锚点数 ${anchors.length} ≠ seq ${seq.length}，已放弃结构化注入`,
    };
  }

  ensureImageContentTypes(zip);
  const relsPath = "word/_rels/document.xml.rels";
  let rels = zip.file(relsPath)?.asText() || "";
  let nextId = nextRelId(rels);
  let imgN = 0;
  let tblN = 0;
  let capFigN = 0;
  let docPrId = 1;
  const replacements: string[] = [];

  for (let i = 0; i < seq.length; i++) {
    const items = seq[i];
    if (!items || !items.length) {
      replacements.push("");
      continue;
    }
    let frag = "";
    for (const item of items) {
      if (item.kind === "table") {
        const seqVal = item.caption ? ++tblN : 0;
        frag += buildTableXml(item.caption, item.rows, seqVal || 1);
      } else if (item.kind === "figure-blocked") {
        frag += buildMissingFigureXml(item.caption, item.ref, item.kind, 0);
      } else if (item.kind === "figure-missing") {
        const seqVal = item.caption ? ++capFigN : 0;
        frag += buildMissingFigureXml(
          item.caption,
          item.ref,
          item.kind,
          seqVal || 1,
        );
      } else {
        imgN += 1;
        const capSeq = ++capFigN;
        const ext = mimeToExt(item.mime);
        const mediaPath = `word/media/img${imgN}.${ext}`;
        zip.file(mediaPath, item.bytes);
        const rId = `rId${nextId++}`;
        const rel =
          `<Relationship Id="${rId}" ` +
          `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
          `Target="media/img${imgN}.${ext}"/>`;
        rels = rels.replace("</Relationships>", `${rel}</Relationships>`);
        frag += buildFigureXml(item, rId, docPrId++, capSeq);
      }
    }
    replacements.push(frag);
  }

  for (let i = anchors.length - 1; i >= 0; i--) {
    const a = anchors[i];
    xml = xml.slice(0, a.start) + replacements[i] + xml.slice(a.end);
  }
  zip.file("word/document.xml", xml);
  if (rels) zip.file(relsPath, rels);
  return {ok: true};
}

/**
 * 九·5：表块数字须出现在证据中；否则丢掉该表（不进 seq）。
 * 无 evidence → 原样放行（离线/空证据不误杀）。
 */
export function filterTableBlockByEvidence(
  block: Extract<DocBlock, {kind: "table"}>,
  evidence?: string,
): Extract<DocBlock, {kind: "table"}> | null {
  const ev = (evidence || "").trim();
  if (!ev) return block;
  const rows = block.rows || [];
  for (let ri = 1; ri < rows.length; ri++) {
    for (const cell of rows[ri] || []) {
      const tip = String(cell || "");
      const tokens = extractMetricTokens(tip);
      for (const tok of tokens) {
        const num = tok.replace(/[%％亿万元]/g, "");
        if (isPriceBandBoundToken(num, "", tip, tip.indexOf(num))) continue;
        if (!evidenceHasMetric(ev, tok)) {
          console.warn("[DocBlock] 表数字未入证据，丢弃表块", tok, block.caption);
          return null;
        }
      }
    }
  }
  return block;
}

/** 按章→段展开顺序收集 blocks；并剥离正文里的围栏 */
export function collectParagraphBlocks(
  chapters: Chapter[],
  opts?: {evidenceText?: string},
): DocBlock[][] {
  const out: DocBlock[][] = [];
  for (const ch of chapters) {
    for (const p of ch.paragraphs || []) {
      absorbBlocksFromParagraphContent(p);
      const blocks: DocBlock[] = [];
      for (const b of p.blocks || []) {
        if (b.kind === "table") {
          const kept = filterTableBlockByEvidence(b, opts?.evidenceText);
          if (kept) blocks.push(kept);
        } else {
          blocks.push(b);
        }
      }
      p.blocks = blocks;
      out.push([...blocks]);
    }
  }
  return out;
}

/**
 * 将 DocBlock 转为可注入 payload；取图失败 → figure-missing（七·7）。
 */
function toAllowedRefSet(
  src: Set<string> | string[] | undefined | null,
): Set<string> | undefined {
  if (src == null) return undefined;
  const raw = src instanceof Set ? [...src] : src;
  return new Set(raw.map((r) => normalizeKbAssetRef(r)).filter(Boolean));
}

export async function resolveBlocksToPayloads(
  blockLists: DocBlock[][],
  opts: DocBlockResolveOpts = {},
): Promise<Array<DocBlockPayloadItem[] | null>> {
  let totalImg = 0;
  const seq: Array<DocBlockPayloadItem[] | null> = [];
  const globalAllow = toAllowedRefSet(opts.allowedFigureRefs);
  for (let li = 0; li < blockLists.length; li++) {
    const blocks = blockLists[li];
    if (!blocks.length) {
      seq.push(null);
      continue;
    }
    // 段级列表：undefined/null 项回退全局；[] / 空 Set = 禁全部
    let allow: Set<string> | undefined = globalAllow;
    if (opts.allowedFigureRefsByList != null) {
      const raw = opts.allowedFigureRefsByList[li];
      allow = raw == null ? globalAllow : toAllowedRefSet(raw);
    }
    const items: DocBlockPayloadItem[] = [];
    for (const b of blocks) {
      if (b.kind === "table") {
        const kept = filterTableBlockByEvidence(b, opts.evidenceText);
        if (!kept) continue;
        items.push({kind: "table", caption: kept.caption || "", rows: kept.rows});
        continue;
      }
      const ref = normalizeKbAssetRef(b.assetRef || "");
      if (allow != null && !allow.has(ref)) {
        const allowedList = [...allow];
        // 二十八·1：诊断——区分「清单空（4B）」与「模型改写 ref」
        console.warn("[DocBlock] figure-blocked", {
          ref: ref || "(空)",
          allowed: allowedList.length,
          sample: allowedList.slice(0, 3),
        });
        items.push({
          kind: "figure-blocked",
          caption: b.caption || "",
          ref: `${ref || "(空)"}（不在可用清单）`,
        });
        continue;
      }
      const resolved = await resolveAssetBytes(ref, opts);
      if (!resolved) {
        items.push({
          kind: "figure-missing",
          caption: b.caption || "",
          // 三十五·4：本地上传失效与 KB 缺失区分文案
          ref: ref.startsWith("upload:") ? UPLOAD_GONE_REF : ref || "(空)",
        });
        continue;
      }
      let bytes = new Uint8Array(resolved.bytes);
      let mime = resolved.mime || "image/png";
      let pxW = 0;
      let pxH = 0;
      // 二十五·1：超闸先降采样，压不动/仍超才 missing
      if (bytes.byteLength > MAX_IMG_BYTES) {
        const resizeFn = opts.resizeImage ?? defaultResizeImage;
        const rs = await resizeFn(bytes, mime, RESIZE_MAX_W, RESIZE_JPEG_Q);
        if (!rs || rs.bytes.byteLength > MAX_IMG_BYTES) {
          console.warn(
            "[DocBlock] 单图超限且降采样失败/仍超",
            ref,
            bytes.byteLength,
            rs?.bytes.byteLength,
          );
          items.push({
            kind: "figure-missing",
            caption: b.caption || "",
            ref: ref || "(空)",
          });
          continue;
        }
        bytes = rs.bytes;
        mime = rs.mime;
        pxW = rs.w;
        pxH = rs.h;
      }
      if (totalImg + bytes.byteLength > MAX_TOTAL_IMG_BYTES) {
        console.warn("[DocBlock] 总图体积超限", ref, totalImg, bytes.byteLength);
        items.push({
          kind: "figure-missing",
          caption: b.caption || "",
          ref: ref || "(空)",
        });
        continue;
      }
      if (!pxW || !pxH) {
        const size = readImageSize(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        );
        pxW = size?.w || 800;
        pxH = size?.h || 600;
      }
      totalImg += bytes.byteLength;
      items.push({
        kind: "figure",
        caption: b.caption || "",
        bytes,
        mime,
        pxW,
        pxH,
      });
    }
    seq.push(items.length ? items : null);
  }
  return seq;
}

/** 解析 kb:文档名/路径 或 upload:key */
export async function resolveAssetBytes(
  assetRef: string,
  opts: DocBlockResolveOpts = {},
): Promise<{bytes: ArrayBuffer; mime: string} | null> {
  const ref = normalizeKbAssetRef(assetRef || "");
  if (!ref) return null;
  if (ref.startsWith("upload:")) {
    const key = ref.slice("upload:".length).trim();
    if (!opts.resolveUpload || !key) return null;
    const got = await opts.resolveUpload(key);
    if (!got) return null;
    return {bytes: got.bytes, mime: got.mime || "image/png"};
  }
  let path = ref;
  if (ref.startsWith("kb:")) path = ref.slice(3).trim();
  const slash = path.indexOf("/");
  if (slash < 0) return null;
  const file_name = path.slice(0, slash).trim();
  const asset_id = path.slice(slash + 1).trim();
  const kbName = (opts.kbName || "").trim();
  if (!kbName || !file_name || !asset_id || !opts.fetchKbAsset) return null;
  try {
    const bytes = await opts.fetchKbAsset({kbName, file_name, asset_id});
    const mime = /\.jpe?g$/i.test(asset_id)
      ? "image/jpeg"
      : /\.gif$/i.test(asset_id)
        ? "image/gif"
        : "image/png";
    return {bytes, mime};
  } catch {
    return null;
  }
}

/** 供 saveDoc：准备 chapters（吸收入正文围栏）并返回块序列 */
export function prepareChaptersBlocks(
  chapters: Chapter[],
  opts?: {evidenceText?: string},
): DocBlock[][] {
  return collectParagraphBlocks(chapters, opts);
}

/** 段落展开数（应等于锚点数） */
export function countParagraphs(chapters: Chapter[]): number {
  let n = 0;
  for (const ch of chapters) n += (ch.paragraphs || []).length;
  return n;
}

export {DOCBLOCK_MARK, PAGE_W_EMU};
