# -*- coding: utf-8 -*-
"""扫 A/B/C 三档原文的开头句式同质化，验证「字数指令是否加剧套路开头」"""
import json, io, re
from collections import Counter

RS = json.load(io.open(r"C:/Users/zelin/WorkBuddy/2026-09-24-12-08-46/ab/result_real.json", encoding="utf-8"))
PAT = [("从X来看/看", r"^从.{2,14}(来看|看|的视角看|维度看|的分布来看)"),
       ("在X上", r"^在.{2,14}上"),
       ("落到X", r"^落到"),
       ("就X而言", r"^就.{2,10}而言"),
       ("整体/总体", r"^(整体|总体|总的)")]
VAGUE = ["相当", "较为", "不容忽视", "微妙", "值得留意", "一定程度", "比较", "明显", "显著", "进一步"]

out = []
for tier in ["A", "B", "C"]:
    rows = [r for r in RS if r["tier"] == tier and isinstance(r.get("text"), str) and len(r["text"]) > 60]
    if not rows:
        continue
    hit = set()
    det = {}
    for tag, pat in PAT:
        ns = [i + 1 for i, r in enumerate(rows) if re.match(pat, r["text"].strip())]
        det[tag] = ns
        hit |= set(ns)
    v = sum(sum(r["text"].count(w) for w in VAGUE) for r in rows)
    c4 = Counter(r["text"].strip()[:4] for r in rows)
    dup = {k: c for k, c in c4.items() if c > 1}
    out.append("档 %s (n=%d): 套路开头 %d/%d = %.0f%%  | 模糊词 %.1f 处/段 | 开头4字重复 %s"
               % (tier, len(rows), len(hit), len(rows), 100.0 * len(hit) / len(rows), v / len(rows),
                  dup if dup else "无"))
    for tag, ns in det.items():
        if ns:
            out.append("    %-12s %s" % (tag, ns))
    out.append("    开头样例: " + " / ".join(r["text"].strip()[:12] for r in rows[:5]))

io.open(r"C:/Users/zelin/WorkBuddy/2026-09-24-12-08-46/ab/tier_style_out.txt", "w",
        encoding="utf-8").write("\n".join(out))
print("\n".join(out))
