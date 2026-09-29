/**
 * 任务 2 · 实体闸（B2）：实体-数值同现校验。
 * 定层：前端 TS（十·2），证据用 ⟦chunk…⟧ / docs 正文；不新建后端 fidelity_gate。
 */
import {
  getActiveCorpusProfile,
  getEntityClassWords,
  type EntityClass,
} from "@/components/DocUtil/corpusProfile";
import {
  extractMetricTokens,
  normalizeMetricToken,
} from "@/components/DocUtil/outlineEvidenceValidate";

export type EntityGateItem = {
  sentence: string;
  action: "pass" | "rewrite" | "drop";
  reason: string;
  result?: string;
};

export type EntityGateReport = {
  blocked_count: number;
  rewritten_count: number;
  items: EntityGateItem[];
};

export type DocEvidenceRow = {
  content?: string;
  page_content?: string;
  snippet?: string;
  chunk_id?: string | number;
  page?: string | number;
  source?: string;
  title?: string;
};

/** 把 chat 返回的 docs[] 拼成与 PPT 同形的证据串 */
export function docsToEvidence(docs: DocEvidenceRow[] | unknown): string {
  if (!Array.isArray(docs) || !docs.length) return "";
  const parts: string[] = [];
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i] as DocEvidenceRow;
    const body = String(d.content || d.page_content || d.snippet || "").trim();
    if (!body) continue;
    const chunk = d.chunk_id ?? i;
    const page = d.page ?? "";
    const src = d.source || d.title || "";
    parts.push(`⟦chunk:${chunk}|page:${page}|src:${src}⟧\n${body}`);
  }
  return parts.join("\n");
}

function splitEvidenceChunks(evidence: string): Array<{id: string; body: string}> {
  const ev = evidence || "";
  if (!ev.includes("⟦chunk:")) {
    return ev.trim() ? [{id: "all", body: ev}] : [];
  }
  return ev
    .split(/(?=⟦chunk:)/)
    .filter((b) => b.trim())
    .map((part, i) => {
      const head = part.match(/^⟦chunk:([^\]]*)⟧/);
      const id = head?.[1] || String(i);
      const body = part.replace(/^⟦chunk:[^\]]*⟧\s*/, "");
      return {id, body};
    });
}

function stripShareIdioms(text: string): string {
  const idioms = getActiveCorpusProfile().raw.shareOfMacroIdioms || [];
  let s = text;
  for (const idiom of idioms) {
    if (!idiom) continue;
    s = s.split(idiom).join("");
  }
  return s;
}

/** 正文中出现的实体类（去掉「占大盘」等附属语后） */
export function detectEntityClassesInText(text: string): Set<EntityClass> {
  const body = stripShareIdioms(text || "");
  const hit = new Set<EntityClass>();
  for (const row of getEntityClassWords()) {
    for (const w of row.words) {
      if (!w) continue;
      if (row.caseInsensitive) {
        if (body.toLowerCase().includes(w.toLowerCase())) {
          hit.add(row.cls);
          break;
        }
      } else if (body.includes(w)) {
        hit.add(row.cls);
        break;
      }
    }
  }
  return hit;
}

/** 指标词面，不能当主语实体（避免「…总销量7280」误判为大盘主语） */
const SUBJECT_STOP_WORDS = new Set(["总销量", "总销售额", "销量", "销售额"]);

/**
 * 句内主语实体：数字左侧最近的品类/大盘词；
 * 价格带单独一类（词面「价格带」）。品类优先于纯指标词。
 */
export function detectSentenceSubjectEntity(
  sentence: string,
): EntityClass | "price_band" | null {
  const s = sentence || "";
  const tokens = extractMetricTokens(s);
  const metricIdx =
    tokens.length > 0
      ? s.search(
          new RegExp(
            tokens[0]
              .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
              .replace(/%/g, "[%％]"),
          ),
        )
      : -1;
  const left = metricIdx >= 0 ? s.slice(0, metricIdx) : s;
  const macroId = getActiveCorpusProfile().macroGroupId;
  const categoryIds = new Set(getActiveCorpusProfile().categoryGroupIds);

  type Cand = {
    cls: EntityClass | "price_band";
    at: number;
    len: number;
    rank: number;
  };
  const cands: Cand[] = [];
  for (const row of getEntityClassWords()) {
    for (const w of row.words) {
      if (!w || SUBJECT_STOP_WORDS.has(w)) continue;
      const hay = row.caseInsensitive ? left.toLowerCase() : left;
      const needle = row.caseInsensitive ? w.toLowerCase() : w;
      const at = hay.lastIndexOf(needle);
      if (at < 0) continue;
      // 品类 > 大盘名 > 其它
      const rank = categoryIds.has(row.cls) ? 3 : row.cls === macroId ? 2 : 1;
      cands.push({cls: row.cls, at, len: w.length, rank});
    }
  }
  if (/价格带/.test(left)) {
    const at = left.lastIndexOf("价格带");
    if (at >= 0) cands.push({cls: "price_band", at, len: 3, rank: 3});
  }
  if (!cands.length) return null;
  // 先比 rank（品类优先），再比位置（更靠近数字），再比词长
  cands.sort((a, b) => b.rank - a.rank || b.at - a.at || b.len - a.len);
  return cands[0].cls;
}
function compactIn(text: string, token: string): boolean {
  const t = normalizeMetricToken(token);
  const body = normalizeMetricToken(text);
  if (!t) return false;
  if (body.includes(t)) return true;
  // 7,280.1万 vs 7280.1万
  const bare = t.replace(/[万亿%％]/g, "");
  return bare.length >= 3 && body.includes(bare);
}

function preferredLabel(cls: EntityClass | "price_band"): string {
  if (cls === "price_band") return "价格带";
  const g = getActiveCorpusProfile().entityGroups.find((x) => x.id === cls);
  if (!g?.words?.length) return String(cls);
  // 优先最长中文标签
  return [...g.words].sort((a, b) => b.length - a.length)[0];
}

function rewriteSubject(
  sentence: string,
  fromCls: EntityClass | "price_band",
  toCls: EntityClass | "price_band",
): string | null {
  if (fromCls === toCls) return null;
  const fromWords =
    fromCls === "price_band"
      ? ["价格带"]
      : [...(getActiveCorpusProfile().entityById.get(fromCls) || [])].sort(
          (a, b) => b.length - a.length,
        );
  const toLabel = preferredLabel(toCls);
  for (const w of fromWords) {
    if (w && sentence.includes(w)) {
      return sentence.replace(w, toLabel);
    }
  }
  return null;
}

/**
 * 单句校验：句中数值须与主语实体在同一证据块同现。
 * - pass：无数值 / 无主语 / 同现成立
 * - rewrite：可回源改主语
 * - drop：不可改写
 */
export function judgeEntitySentence(
  sentence: string,
  evidence: string,
): EntityGateItem {
  const tokens = extractMetricTokens(sentence);
  if (!tokens.length) {
    return {sentence, action: "pass", reason: "无指标数字"};
  }
  const subject = detectSentenceSubjectEntity(sentence);
  if (!subject) {
    return {sentence, action: "pass", reason: "无显式主语实体"};
  }
  const chunks = splitEvidenceChunks(evidence);
  if (!chunks.length) {
    return {sentence, action: "pass", reason: "无证据跳过"};
  }

  // 找含该数值的块
  const owners = chunks.filter((c) =>
    tokens.some((tok) => compactIn(c.body, tok)),
  );
  if (!owners.length) {
    // 证据里根本没有这个数 → 交给忠实度闸；实体闸不重复杀
    return {sentence, action: "pass", reason: "数值未入证据（交忠实度闸）"};
  }

  const ownerClasses = new Set<EntityClass>();
  for (const o of owners) {
    for (const cls of detectEntityClassesInText(o.body)) {
      ownerClasses.add(cls);
    }
  }
  // 价格带：块内须有「价格带」
  if (subject === "price_band") {
    const ok = owners.some((o) => /价格带/.test(o.body));
    if (ok) return {sentence, action: "pass", reason: "价格带同现"};
    return {
      sentence,
      action: "drop",
      reason: "价格带数值未与价格带块同现",
    };
  }

  if (ownerClasses.has(subject)) {
    return {sentence, action: "pass", reason: "实体-数值同现"};
  }

  // 可改写：证据块主导实体唯一时，改主语
  const macroId = getActiveCorpusProfile().macroGroupId;
  let target: EntityClass | "price_band" | null = null;
  if (ownerClasses.size === 1) {
    target = [...ownerClasses][0];
  } else if (ownerClasses.has(macroId) && ownerClasses.size > 1) {
    // 大盘数与品类共块时，数值若更贴近大盘语境（总销量）→ 大盘
    const blob = owners.map((o) => o.body).join(" ");
    if (/总销量|总销售额|男装大盘/.test(blob)) target = macroId;
  }
  if (target && target !== subject) {
    const rewritten = rewriteSubject(sentence, subject, target);
    if (rewritten && rewritten !== sentence) {
      return {
        sentence,
        action: "rewrite",
        reason: `主语 ${subject} 与证据实体 ${target} 冲突，已回源改写`,
        result: rewritten,
      };
    }
  }
  return {
    sentence,
    action: "drop",
    reason: `主语 ${subject} 与证据实体 {${[...ownerClasses].join(",")}} 冲突`,
  };
}

function splitSentences(text: string): string[] {
  const s = String(text || "").trim();
  if (!s) return [];
  // 保留分隔符附着在句末
  return s
    .split(/(?<=[。！？；\n])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** 对整段正文施实体闸；返回清洗后正文 + 报告 */
export function applyEntityGate(
  text: string,
  evidence: string,
): {text: string; report: EntityGateReport} {
  const sentences = splitSentences(text);
  const items: EntityGateItem[] = [];
  const out: string[] = [];
  let blocked = 0;
  let rewritten = 0;
  for (const sent of sentences) {
    const j = judgeEntitySentence(sent, evidence);
    items.push(j);
    if (j.action === "pass") {
      out.push(sent);
    } else if (j.action === "rewrite" && j.result) {
      out.push(j.result);
      rewritten++;
      blocked++;
    } else {
      blocked++;
      // drop：不写入
    }
  }
  // 去掉因删句产生的多余空行
  const merged = out.join("").replace(/\n{3,}/g, "\n\n").trim();
  return {
    text: merged,
    report: {blocked_count: blocked, rewritten_count: rewritten, items},
  };
}
