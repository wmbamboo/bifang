# -*- coding: utf-8 -*-
import zipfile, re, io, json, sys
from collections import Counter

PATH = r"C:/Users/zelin/Desktop/抖音商务衬衫polo选品分析-Ai-v2026920.docx"
z = zipfile.ZipFile(PATH)
x = z.read("word/document.xml").decode("utf8")
STY = z.read("word/styles.xml").decode("utf8")


def style_name(sid):
    m = re.search(r'<w:style [^>]*w:styleId="%s"[^>]*>(.*?)</w:style>' % re.escape(sid), STY, re.S)
    if not m:
        return sid
    nm = re.search(r'<w:name w:val="([^"]+)"', m.group(1))
    return nm.group(1) if nm else sid


def para_text(p):
    return "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S))


def wc(t):
    return len(re.findall(r"[\u4e00-\u9fff]", t)) + len(re.findall(r"[A-Za-z0-9]+", t))


paras = re.findall(r"<w:p\b[^>]*>.*?</w:p>", x, re.S)
rows = []
for p in paras:
    ps = re.search(r'<w:pStyle w:val="([^"]+)"', p)
    sid = ps.group(1) if ps else ""
    t = para_text(p)
    rows.append({"styleId": sid, "style": style_name(sid) if sid else "Normal",
                 "text": t, "words": wc(t)})

out = []
out.append("=== 段落总数 %d ===" % len(rows))
out.append("\n=== 样式分布 ===")
for k, v in Counter(r["style"] for r in rows).most_common():
    out.append("  %-16s %d" % (k, v))

out.append("\n=== 全文结构（非空段，style | 字数 | 前 46 字）===")
for i, r in enumerate(rows):
    if not r["text"].strip():
        continue
    out.append("%3d | %-12s | %4d | %s" % (i, r["style"][:12], r["words"], r["text"][:46].replace("\n", " ")))

# 标题层级
out.append("\n=== 标题层级统计 ===")
h = [r for r in rows if r["style"].startswith("heading")]
for k, v in sorted(Counter(r["style"] for r in h).items()):
    out.append("  %-14s %d" % (k, v))
out.append("  标题总字数占比: %.1f%%" % (100.0 * sum(r["words"] for r in h) / max(1, sum(r["words"] for r in rows))))

# 正文段字数
body = [r for r in rows if not r["style"].startswith("heading") and r["words"] > 30]
if body:
    ws = sorted(r["words"] for r in body)
    import statistics
    out.append("\n=== 正文段字数（>30 字，n=%d）===" % len(body))
    out.append("  均值 %.1f 中位 %d 最小 %d 最大 %d" % (
        statistics.mean(ws), statistics.median(ws), ws[0], ws[-1]))
    out.append("  分布: " + ", ".join(str(v) for v in ws))

# TOC
out.append("\n=== 目录 ===")
for m in re.finditer(r'<w:instrText[^>]*>(.*?)</w:instrText>', x, re.S):
    out.append("  域: " + m.group(1).strip()[:80])

# 图表
out.append("\n=== 表/图 ===")
out.append("  w:tbl 数量 %d" % x.count("<w:tbl>"))
out.append("  插图 drawings %d" % x.count("<w:drawing>"))
out.append("  media 文件 %s" % [n for n in z.namelist() if "media" in n])

# 内容质量标记
full = "".join(r["text"] for r in rows)
out.append("\n=== 质量问题扫描 ===")
for tag, pat in [(" figureref 泄漏", r"figureref"), (" 围栏残留 ```", r"```"),
                 (" DOCBLOCK 锚点泄漏", r"DOCBLOCK"), (" 占位符残留 {", r"\{[a-zA-Z#/]+\}"),
                 (" 引用标记 [文档N]", r"\[文档\d+\]"), (" 裸引用 [数字]", r"(?<!文档)\[\d+\]")]:
    n = len(re.findall(pat, full))
    out.append("  %-22s %d" % (tag, n))
for tag, pat in [(" 套话开头「根据」", r"根据(知识库|材料|以上)"),
                 (" 套话结尾「综上」", r"综上"),
                 (" 「首先/其次」编号腔", r"首先|其次|再者")]:
    out.append("  %-22s %d" % (tag, len(re.findall(pat, full))))

# 标题内容体检
out.append("\n=== 标题体检（是否数据句/过长/缺动词）===")
for r in h:
    t = r["text"].strip()
    flag = []
    if re.search(r"\d", t) and len(t) > 12:
        flag.append("数据句?")
    if r["words"] > 25:
        flag.append("过长")
    if re.search(r"[，。、；]", t):
        flag.append("含标点")
    out.append("  [%-9s] %-40s %s" % (r["style"][-9:], t[:40], " ".join(flag)))

io.open(r"C:/Users/zelin/WorkBuddy/2026-09-24-12-08-46/ab/audit_out.txt", "w",
        encoding="utf-8").write("\n".join(out))
print("\n".join(out[:60]))
