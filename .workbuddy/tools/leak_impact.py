# -*- coding: utf-8 -*-
"""验证：Ai 版字数超标是否由围栏泄漏撑出来的"""
import zipfile, re, io

PATH = r"C:/Users/zelin/Desktop/抖音商务衬衫polo选品分析-Ai-v2026920.docx"
z = zipfile.ZipFile(PATH)
x = z.read("word/document.xml").decode("utf8")
paras = re.findall(r"<w:p\b[^>]*>.*?</w:p>", x, re.S)


def ptext(p):
    return "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S))


def wc(t):
    return len(re.findall(r"[\u4e00-\u9fff]", t)) + len(re.findall(r"[A-Za-z0-9]+", t))


# 目标（真实大纲要点数 -> 150+60n）
TARGET = {"1.1": 270, "1.2": 330, "1.3": 270, "2.1": 330, "2.2": 270, "2.3": 330,
          "3.1": 330, "3.2": 330, "3.3": 270, "3.4": 330,
          "4.1": 270, "4.2": 270, "4.3": 270}

head_idx = {}
for i, p in enumerate(paras):
    t = ptext(p).strip()
    m = re.match(r"^(\d\.\d)\s", t)
    if m:
        head_idx[m.group(1)] = i

FENCE = re.compile(r"```.*?```", re.S)

out = []
out.append("%-6s %-18s %6s %6s %6s %8s %8s" % ("编号", "段题", "目标", "原字数", "去围栏", "原偏差", "净偏差"))
tot_o = tot_n = tot_t = 0
hit_o = hit_n = 0
n = 0
for code, i in sorted(head_idx.items()):
    j = i + 1
    while j < len(paras) and not ptext(paras[j]).strip():
        j += 1
    raw = ptext(paras[j])
    clean = FENCE.sub("", raw)
    o, c, tg = wc(raw), wc(clean), TARGET[code]
    dev_o = (o - tg) / tg * 100
    dev_c = (c - tg) / tg * 100
    hit_o += abs(dev_o) <= 20
    hit_n += abs(dev_c) <= 20
    tot_o += o; tot_n += c; tot_t += tg
    n += 1
    out.append("%-6s %-18s %6d %6d %6d %+7.0f%% %+7.0f%%" % (
        code, ptext(paras[i]).strip()[:16], tg, o, c, dev_o, dev_c))

out.append("")
out.append("合计 n=%d  目标均值 %.1f  原均值 %.1f(%+.1f%%)  去围栏均值 %.1f(%+.1f%%)" % (
    n, tot_t / n, tot_o / n, (tot_o - tot_t) / tot_t * 100,
    tot_n / n, (tot_n - tot_t) / tot_t * 100))
out.append("命中率(±20%%)  原 %d/%d=%.0f%%   去围栏 %d/%d=%.0f%%" % (
    hit_o, n, 100.0 * hit_o / n, hit_n, n, 100.0 * hit_n / n))

io.open(r"C:/Users/zelin/WorkBuddy/2026-09-24-12-08-46/ab/leak_impact_out.txt",
        "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
