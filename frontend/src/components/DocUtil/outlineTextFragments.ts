/**
 * 半句截断 / 图表轴碎片：填充闸与成品闸共用，禁止两处复制漂移。
 * 无业务依赖，可被 PptProductGate / outlineEvidenceValidate 安全 import。
 */

/** 剥 tip 前缀（metric:/list:/col:）后再判截断 */
export function stripTipRolePrefix(tip: string): string {
  return String(tip || "")
    .replace(
      /^(?:metric|list|col|column|栏|colSub|columnSub|栏副|副标)\s*[:：]\s*/i,
      "",
    )
    .trim();
}

/** 半句截断：日期残缺、尾随分隔、悬挂虚词、价带残词、同比悬空符号 */
export function isTruncatedPlainLine(line: string): boolean {
  const s = String(line || "").trim();
  if (!s || s.length < 3) return false;
  if (/20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}\s*$/.test(s)) return false;
  if (/20\d{2}[.\-/]\d{1,2}[.\-/]?\s*$/.test(s)) return true;
  if (/至\s*20\d{2}[.\-/]\d{1,2}[.\-/]?\s*$/.test(s)) return true;
  if (/[.\-/~～—–]\s*$/.test(s)) return true;
  if (s.length >= 5 && /[的与和及为至于按]$/.test(s)) return true;
  if (/各价格$|均为各价格$/.test(s)) return true;
  if (/同比[+\-＋－]\s*$|环比[+\-＋－]\s*$|增速[+\-＋－]\s*$/.test(s)) return true;
  if (/至\s*20\d{2}[.\-/]\d{1,2}[.\-/]\s*$/.test(s)) return true;
  return false;
}

/** 图表轴/刻度碎片：不成句的价位串、坐标轴黑话 */
export function isChartAxisFragmentPlain(line: string): boolean {
  const s = String(line || "").trim();
  if (!s) return false;
  const compact = s.replace(/\s+/g, "");
  if (/^(?:[￥¥]?\d{2,4}[\/\|、]){1,}[￥¥]?\d{2,4}$/.test(compact)) {
    return true;
  }
  if (/^[￥¥]\s*\d{2,4}$/.test(s)) return true;
  if (
    /^(?:TOP款?口径|销量席位|横轴|纵轴|图例|坐标轴|单位[:：]?万?件?|刻度)$/i.test(
      s,
    )
  ) {
    return true;
  }
  const parts = s.split(/\s*[\/\|、]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const crumb = parts.filter(
      (p) =>
        /^[￥¥]?\s*\d{2,4}$/.test(p) ||
        /^(?:TOP款?口径|销量席位|横轴|纵轴|图例)$/i.test(p),
    );
    if (crumb.length >= 3 && crumb.length >= parts.length - 1) return true;
  }
  return false;
}
