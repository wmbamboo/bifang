# -*- coding: utf-8 -*-
"""对任意 docx 跑「开头句式 / 模糊词」扫描。用法: python style_scan2.py <docx> [标签]"""
import zipfile, re, io, sys, os
from collections import Counter

P = sys.argv[1]
LABEL = sys.argv[2] if len(sys.argv) > 2 else os.path.basename(P)
z = zipfile.ZipFile(P)
x = z.read("word/document.xml").decode("utf8")
STY = z.read("word/styles.xml").decode("utf8")
paras = re.findall(r"<w:p\b[^>]*>.*?</w:p>", x, re.S)


def sid_name(sid):
    m = re.search(r'<w:style [^>]*w:styleId="%s"[^>]*>(.*?)</w:style>' % re.escape(sid), STY, re.S)
    if not m:
        return ""
    nm = re.search(r'<w:name w:val="([^"]+)"', m.group(1))
    return nm.group(1) if nm else ""


def txt(p):
    return "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S))


body = []
for p in paras:
    ps = re.search(r'<w:pStyle w:val="([^"]+)"', p)
    sid = ps.group(1) if ps else ""
    nm = sid_name(sid) if sid else ""
    t = txt(p).strip()
    if nm.startswith("heading") or nm == "Title":
        continue
    # 清洗泄漏的围栏文本后再统计（不整段剔除，否则样本不可比）
    t = re.sub(r"```.*?```", "", t, flags=re.S)
    t = re.sub(r"\s*(figure|table)\s*ref\s*:.*", "", t)
    t = t.strip()
    if len(t) > 60:
        body.append(t)

out = ["### %s —— 正文 %d 段" % (LABEL, len(body))]
out.append("\n开头 14 字：")
for i, t in enumerate(body):
    out.append("  %2d. %s…" % (i + 1, t[:14]))

pats = [("「从X来看/看」", r"^从.{2,12}(来看|看|的视角看|维度看|的分布来看)"),
        ("「在X上」", r"^在.{2,12}上"),
        ("「落到X」", r"^落到"),
        ("「就X而言」", r"^就.{2,10}而言"),
        ("「数据/结果显」", r"^(数据|结果|从数据)"),
        ("「整体/总体」", r"^(整体|总体|总的)")]
hit = set()
for tag, pat in pats:
    ns = [i + 1 for i, t in enumerate(body) if re.match(pat, t)]
    hit |= set(ns)
    out.append("  %-16s %d 段 %s" % (tag, len(ns), ns))
out.append("  ⇒ 套路开头 %d/%d = %.0f%%" % (len(hit), len(body), 100.0 * len(hit) / max(1, len(body))))

c6 = Counter(t[:6] for t in body)
dup = {k: v for k, v in c6.items() if v > 1}
out.append("  开头 6 字重复: %s" % (dup if dup else "无"))

vague = ["相当", "较为", "不容忽视", "微妙", "值得留意", "一定程度", "比较", "明显", "显著", "进一步"]
tot = 0
det = []
for w in vague:
    n = sum(t.count(w) for t in body)
    if n:
        det.append("%s×%d" % (w, n))
        tot += n
out.append("  模糊限定词 %d 处（%.1f/段）: %s" % (tot, tot / max(1, len(body)), " ".join(det)))

# 首句是否复述标题
out.append("  ⇒ 综上: 套路开头 %.0f%% | 模糊词 %.1f 处/段" % (
    100.0 * len(hit) / max(1, len(body)), tot / max(1, len(body))))
print("\n".join(out))
