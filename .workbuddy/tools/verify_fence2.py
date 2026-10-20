# -*- coding: utf-8 -*-
"""对照实验：现行归一化 vs 补两条修正（行尾闭合 + ref/caption 同行切分）"""
import zipfile, re, io

P = r"C:/Users/zelin/Desktop/抖音商务衬衫polo选品分析-Ai-v2026920.docx"
z = zipfile.ZipFile(P)
x = z.read("word/document.xml").decode("utf8")
paras = re.findall(r"<w:p\b[^>]*>.*?</w:p>", x, re.S)


def txt(p):
    return "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S))


def preprocess(s, extra):
    s = re.sub(r"```\s*```", "```\n```", s)
    s = re.sub(r"```\s*figureref\s*[:：]\s*", "```figure\nref: ", s, flags=re.I)
    s = re.sub(r"```\s*figurecaption\s*[:：]\s*", "```figure\ncaption: ", s, flags=re.I)
    s = re.sub(r"```\s*tablecaption\s*[:：]\s*", "```table\ncaption: ", s, flags=re.I)
    s = re.sub(r"```\s*figure\s+(?=ref\s*[:：])", "```figure\n", s, flags=re.I)
    s = re.sub(r"```\s*table\s+(?=caption\s*[:：])", "```table\n", s, flags=re.I)
    if extra:
        # 修正②：ref 值里 png/jpg 后紧跟 caption: → 切成两行
        s = re.sub(r"(\.(?:png|jpe?g|gif|webp))\s*(caption|图)\s*([:：])",
                   r"\1\n\2\3", s, flags=re.I)
    return s


def parse_stream(raw, extra_tail):
    lines = raw.split("\n")
    state, buf, blocks = "normal", [], []
    for line in lines:
        t = line.strip()
        if state == "normal":
            if not t or t == "```":
                continue
            m = re.match(r"^```\s*([A-Za-z]*)\s*(.*)$", t)
            if m:
                tag = (m.group(1) or "").lower()
                rest = (m.group(2) or "").strip()
                if tag.startswith("table"):
                    state, buf = "table", []
                    if rest:
                        buf.append(("cap", rest))
                    continue
                if tag.startswith("figure") or tag == "figureref":
                    state, buf = "figure", []
                    if rest:
                        buf.append(("ref", rest if rest.lower().startswith("ref:") else "ref: " + rest))
                    continue
            if t.startswith("```"):
                state, buf = "unknown", []
                continue
            continue
        # 闭合判定
        closed = False
        body = t
        if re.match(r"^```\s*$", t):
            closed, body = True, ""
        elif extra_tail and t.endswith("```"):
            closed, body = True, t[:-3].strip()
        if closed:
            if body:
                buf.append(("cap" if state == "table" else
                            ("cap" if re.match(r"^(?:caption|图)\s*[:：]", body, re.I) else "ref"), body))
            if state == "figure":
                blocks.append(parse_figure(buf))
            elif state == "table":
                blocks.append(parse_table(buf))
            state, buf = "normal", []
            continue
        m = re.match(r"^```\s*([A-Za-z]*)\s*(.*)$", t)
        if m:
            if state == "figure":
                blocks.append(parse_figure(buf))
            elif state == "table":
                blocks.append(parse_table(buf))
            tag = (m.group(1) or "").lower()
            rest = (m.group(2) or "").strip()
            state = "table" if tag.startswith("table") else ("figure" if tag.startswith("figure") else "unknown")
            buf = []
            if rest and state != "unknown":
                buf.append(("cap" if state == "table" else "ref", rest))
            continue
        if state == "figure":
            buf.append(("cap" if re.match(r"^(?:caption|图)\s*[:：]", t, re.I) else "ref", t))
        elif state == "table":
            buf.append(("cap", t))
    if state != "normal":
        if state == "figure":
            blocks.append(parse_figure(buf))
        elif state == "table":
            blocks.append(parse_table(buf))
    return blocks


def parse_figure(buf):
    caption, ref = "", ""
    for k, v in buf:
        m = re.match(r"^(?:caption|图)\s*[:：]\s*(.+)$", v, re.I | re.S)
        if m:
            caption = m.group(1).strip()
            continue
        m = re.match(r"^(?:ref|assetRef|asset)\s*[:：]\s*(.+)$", v, re.I | re.S)
        if m:
            ref = m.group(1).strip()
    if not ref and not caption:
        return None
    return {"kind": "figure", "assetRef": ref, "caption": caption}


def parse_table(buf):
    rows = [v for k, v in buf if "|" in v]
    if not rows:
        return None
    return {"kind": "table", "rows": len(rows)}


FULL = "\n".join(txt(p) for p in paras)

out = []
for label, extra, tail in [("A 现行（十九章已落地）", False, False),
                           ("B +行尾闭合", False, True),
                           ("C +行尾闭合 +ref/caption同行切分", True, True)]:
    raw = preprocess(FULL, extra)
    blocks = parse_stream(raw, tail)
    fig = [b for b in blocks if b and b["kind"] == "figure"]
    tab = [b for b in blocks if b and b["kind"] == "table"]
    drop = sum(1 for b in blocks if b is None)
    okfig = [b for b in fig if b["assetRef"].startswith("kb:") and b["assetRef"].endswith((".png", ".jpg", ".jpeg")) and b["caption"]]
    out.append("【%s】" % label)
    out.append("  figure 块 %d（ref+caption 均正确 %d）| table 块 %d | 丢弃 %d" % (len(fig), len(okfig), len(tab), drop))
    for b in fig[:8]:
        r = b["assetRef"]
        good = r.startswith("kb:") and r.endswith((".png", ".jpg", ".jpeg")) and b["caption"]
        out.append("    %s ref尾=%s | caption=%s" % ("OK " if good else "BAD", r[-30:], (b["caption"] or "(空)")[:24]))
    out.append("")

io.open(r"C:/Users/zelin/WorkBuddy/2026-09-24-12-08-46/ab/verify_fence2_out.txt", "w",
        encoding="utf-8").write("\n".join(out))
print("\n".join(out))
