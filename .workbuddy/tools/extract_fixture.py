# -*- coding: utf-8 -*-
"""提取 9-20 产物里真实的退化围栏原文（归一化前），供单测做 fixture"""
import zipfile, re, io

P = r"C:/Users/zelin/Desktop/抖音商务衬衫polo选品分析-Ai-v2026920.docx"
z = zipfile.ZipFile(P)
x = z.read("word/document.xml").decode("utf8")
paras = re.findall(r"<w:p\b[^>]*>.*?</w:p>", x, re.S)


def txt(p):
    return "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S))


FULL = "\n".join(txt(p) for p in paras)
lines = FULL.split("\n")
out = []
for i, ln in enumerate(lines):
    if "```" in ln:
        # 打印该行尾部 90 字（含围栏本体），并带上一行尾 30 字判断开栏位置
        prev = lines[i - 1][-30:] if i > 0 else ""
        out.append("行%3d 前文尾: …%s" % (i, prev))
        out.append("行%3d 本行: %s" % (i, ln[-150:]))
        out.append("")
io.open(r"C:/Users/zelin/WorkBuddy/2026-09-24-12-08-46/ab/fixture_raw.txt", "w",
        encoding="utf-8").write("\n".join(out))
print("\n".join(out[:34]))
