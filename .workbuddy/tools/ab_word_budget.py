# -*- coding: utf-8 -*-
"""
段落字数指令 A/B 实测（毕方 十四·3.4 / 十四·4 校准）

三档：
  A = 不给字数指令
  B = 「撰写 200~400 字」（现状：区间常数）
  C = 「撰写约 N 字」N = clamp(150 + 60*要点数, 150, 600)（变量化方案）

指标：每段中文字数、均值、标准差、变异系数 CV、命中率（|实际-目标|/目标 <= 20%）、长短比 max/min
说明：不接检索，用一份固定材料摘要喂给所有段，只测「字数指令对长度的控制力」，不评价内容真实性。
用法：
  python ab_word_budget.py --outline polo_outline_sample.md [--tiers A,B,C] [--out result.json]
"""
import argparse
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE_URL = "https://api.deepseek.com/v1/chat/completions"
DOC_TITLE = "选品分析"
ENV_PATH = r"\\wsl.localhost\Ubuntu\home\hezl\bifang\backend\.env"

MATERIAL = (
    "【材料摘要·仅供本次长度测试】\n"
    "近一年 polo 衫品类总销量 7,280.1 万件，同比增长 12.4%；客单价中位数 168 元。"
    "价格带结构：0-99 元占 21.3%，100-199 元占 44.6%，200-299 元占 22.1%，300 元以上占 12.0%。"
    "面料：珠地棉 47.8%、丝光棉 18.2%、功能混纺（凉感/速干/抗菌）26.5%，功能混纺同比 +31.2%。"
    "版型：常规版 61.4%、修身版 29.7%、宽松版 8.9%。领型：小翻领 55.2%、立领 33.6%、无领 11.2%。"
    "颜色：黑/白/藏青等基础色 68.4%，撞色拼色 19.5%，亮色 12.1%；撞色拼色互动率高出基础色 1.7 倍。"
    "功能卖点提及率：凉感 34.2%、速干 28.9%、抗菌 17.6%、免烫 12.4%。"
    "场景：通勤 52.3%、休闲 39.1%、运动 8.6%。转化：100-199 元带转化率 3.8%，200-299 元带 2.9%，"
    "0-99 元带 4.1% 但退货率 18.7%（高于均值 9.2pp）。"
)


def load_api_key():
    for p in (ENV_PATH, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")):
        try:
            with open(p, encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if line.strip().startswith("DEEPSEEK_API_KEY="):
                        v = line.split("=", 1)[1].strip()
                        if v:
                            return v
        except OSError:
            continue
    return ""


def parse_outline(md):
    chapters, cur_ch, cur_p = [], None, None
    for raw in md.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.startswith("#### "):
            if cur_p is not None:
                cur_p["points"].append(line[5:].strip())
        elif line.startswith("### "):
            cur_p = {"title": line[4:].strip(), "points": []}
            if cur_ch is None:
                cur_ch = {"title": "", "paragraphs": []}
                chapters.append(cur_ch)
            cur_ch["paragraphs"].append(cur_p)
        elif line.startswith("## "):
            cur_ch = {"title": line[3:].strip(), "paragraphs": []}
            chapters.append(cur_ch)
            cur_p = None
        elif line.startswith("# "):
            continue
    return chapters


def budget_for(points, base=150):
    return max(150, min(600, base + 60 * len(points)))


def word_count(t):
    cn = len(re.findall(r"[\u4e00-\u9fff]", t))
    en = len(re.findall(r"[A-Za-z0-9]+", t))
    return cn + en


TIER_TEXT = {
    "A": "",
    "B": "撰写 200~400 字的正文。",
}

CONCLUSION_PAT = re.compile(r"结论|建议|总结|结语|行动|下一步")


def is_conclusion_chapter(ch_title):
    return bool(CONCLUSION_PAT.search(str(ch_title or "")))


def make_prompt(ch_title, para, tier):
    pts = "\n".join("- " + p for p in para["points"])
    head = (
        f"你是服装选品师，正在撰写《{DOC_TITLE}》的一段正文。\n"
        "要求：中文散文段落，不用项目符号罗列，不要自造材料里没有的数字，不要写小标题。\n"
        f"【所属章节】{ch_title}\n"
        f"【本段主题】{para['title']}\n"
    )
    if pts:
        head += f"【本段要点·真实数据，写作时必须用上，不得改写数字、不得引入要点以外的数字】\n{pts}\n"
    if tier == "C":
        n = budget_for(para["points"], 150)
        head += f"撰写约 {n} 字的正文。\n"
    elif tier == "E":
        n = budget_for(para["points"], 150)
        if is_conclusion_chapter(ch_title):
            n = int(round(n * 0.85))
        head += f"撰写约 {n} 字的正文。\n"
    elif tier == "D":
        n = budget_for(para["points"], 170)
        head += f"撰写约 {n} 字的正文。\n"
    else:
        head += TIER_TEXT[tier] + "\n"
    return head


def call_llm(prompt, key, model="deepseek-chat", timeout=120, retry=3):
    body = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
            "stream": False,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        BASE_URL,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
    )
    last = ""
    for i in range(retry):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = json.loads(r.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
        except (urllib.error.URLError, KeyError, TimeoutError, json.JSONDecodeError) as e:
            last = repr(e)
            time.sleep(2 + 2 * i)
    return "[ERROR] " + last


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--outline", default="polo_outline_sample.md")
    ap.add_argument("--tiers", default="A,B,C")
    ap.add_argument("--out", default="result.json")
    ap.add_argument("--model", default="deepseek-chat")
    ap.add_argument("--title", default="选品分析")
    args = ap.parse_args()
    global DOC_TITLE
    DOC_TITLE = args.title

    key = load_api_key()
    if not key:
        print("NO_API_KEY")
        return 2

    with open(args.outline, encoding="utf-8") as f:
        chapters = parse_outline(f.read())

    jobs = []
    for ch in chapters:
        for p in ch["paragraphs"]:
            for tier in args.tiers.split(","):
                jobs.append((tier, ch["title"], p))

    print("段落数=%d 任务数=%d" % (sum(len(c["paragraphs"]) for c in chapters), len(jobs)))

    def run(job):
        tier, ch_title, p = job
        text = call_llm(make_prompt(ch_title, p, tier), key, args.model)
        base = 170 if tier == "D" else 150
        tgt = budget_for(p["points"], base)
        conc = is_conclusion_chapter(ch_title)
        instr = int(round(tgt * 0.85)) if (tier == "E" and conc) else tgt
        return {"tier": tier, "chapter": ch_title, "title": p["title"],
                "points": len(p["points"]), "target": tgt, "instructed": instr,
                "conclusion": conc, "words": word_count(text), "text": text}

    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(run, jobs))

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)

    print("\n%-4s %-8s %-8s %-8s %-8s %-8s %s" % ("档", "均值", "中位", "标准差", "CV", "命中率", "最短/最长"))
    for tier in args.tiers.split(","):
        rows = [r for r in results if r["tier"] == tier and not str(r["words"]).startswith("[")]
        if not rows:
            continue
        ws = [r["words"] for r in rows]
        mean = statistics.mean(ws)
        sd = statistics.pstdev(ws)
        hit = sum(1 for r in rows if abs(r["words"] - r["target"]) / r["target"] <= 0.2) / len(rows)
        print("%-4s %-8.1f %-8d %-8.1f %-8.2f %-8.0f%% %d/%d"
              % (tier, mean, statistics.median(ws), sd, sd / mean, hit * 100, min(ws), max(ws)))

    print("\n明细（档 / 段题 / 要点数 / 目标 / 实际 / 偏差）")
    for r in results:
        if str(r["words"]).startswith("["):
            print(r["tier"], r["title"], "FAILED", r["text"][:80])
            continue
        dev = (r["words"] - r["target"]) / r["target"] * 100
        print("%s | %s | 点%d | 目标%d | 实际%d | %+.0f%%"
              % (r["tier"], r["title"], r["points"], r["target"], r["words"], dev))
    return 0


if __name__ == "__main__":
    sys.exit(main())
