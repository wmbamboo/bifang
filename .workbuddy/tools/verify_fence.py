# -*- coding: utf-8 -*-
"""用 9-20 产物的真实退化围栏，验证十九章归一化是否真能救回图/表。
复现 docFenceNormalize.ts 的 preprocess + matchFenceOpen + seedFenceBuffer + parseFigureFenceLines。"""
import zipfile, re, io

P = r"C:/Users/zelin/Desktop/抖音商务衬衫polo选品分析-Ai-v2026920.docx"
z = zipfile.ZipFile(P)
x = z.read("word/document.xml").decode("utf8")
paras = re.findall(r"<w:p\b[^>]*>.*?</w:p>", x, re.S)


def txt(p):
    return "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S))


def preprocess(s):
    s = re.sub(r"```\s*```", "```\n```", s)
    s = re.sub(r"```\s*figureref\s*[:：]\s*", "```figure\nref: ", s, flags=re.I)
    s = re.sub(r"```\s*figurecaption\s*[:：]\s*", "```figure\ncaption: ", s, flags=re.I)
    s = re.sub(r"```\s*tablecaption\s*[:：]\s*", "```table\ncaption: ", s, flags=re.I)
    s = re.sub(r"```\s*figure\s+(?=ref\s*[:：])", "```figure\n", s, flags=re.I)
    s = re.sub(r"```\s*table\s+(?=caption\s*[:：])", "```table\n", s, flags=re.I)
    return s


FENCE_END = re.compile(r"^```\s*$")


def match_open(line):
    t = line.strip()
    m = re.match(r"^```\s*([A-Za-z]*)\s*(.*)$", t)
    if not m:
        return None
    tag = (m.group(1) or "").lower()
    rest = (m.group(2) or "").strip()
    if not tag and not rest:
        return None
    if tag.startswith("table"):
        return ("table", rest)
    if tag.startswith("figure") or tag == "figureref":
        return ("figure", rest)
    if not tag and rest:
        if re.match(r"^(?:ref|kb:)", rest, re.I):
            return ("figure", rest)
        return ("unknown", rest)
    if not tag:
        return None
    return ("unknown", rest)


def seed(kind, rest, buf):
    r = (rest or "").strip()
    if not r or kind == "unknown":
        return
    if kind == "figure":
        buf.append(("ref", r) if r.startswith("ref:") else ("ref", "ref: " + r))
        return
    buf.append(("caption", r))


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


out = []
n = 0
# docx 里一个逻辑段落的围栏会被拆进多个 <w:p>，按全文拼接还原
FULL = "\n".join(txt(p) for p in paras)
seq_chunks = [FULL]
for pi, raw0 in enumerate(seq_chunks):
    if "```" not in raw0:
        continue
    raw = preprocess(raw0)
    lines = raw.split("\n")
    state, buf = "normal", []
    blocks = []
    for line in lines:
        t = line.strip()
        if state == "normal":
            if FENCE_END.match(t):
                continue
            op = match_open(t)
            if op:
                state, buf = op[0], []
                seed(op[0], op[1], buf)
                continue
            if t.startswith("```"):
                state, buf = "unknown", []
                continue
            continue
        if FENCE_END.match(t):
            if state == "figure":
                b = parse_figure(buf)
                blocks.append(b)
            elif state == "table":
                blocks.append({"kind": "table", "rows": len(buf)})
            buf, state = [], "normal"
            continue
        op = match_open(t)
        if op:
            if state == "figure":
                blocks.append(parse_figure(buf))
            state, buf = op[0], []
            seed(op[0], op[1], buf)
            continue
        if state != "unknown":
            v = t
            if state == "figure":
                if re.match(r"^(?:caption|图)\s*[:：]", v, re.I):
                    buf.append(("caption", v))
                else:
                    buf.append(("ref", v))
            else:
                buf.append(("caption", v))
    if state != "normal":
        if state == "figure":
            blocks.append(parse_figure(buf))

    n += 1
    out.append("--- 段 p%d ---" % pi)
    for b in blocks:
        if b is None:
            out.append("   [丢弃] 无法归一")
        elif b["kind"] == "figure":
            ref = b["assetRef"]
            ok_ref = ref.startswith("kb:") and "caption" not in ref and ref.endswith((".png", ".jpg", ".jpeg"))
            out.append("   figure ref_ok=%s caption=%r" % (ok_ref, b["caption"][:30]))
            if not ok_ref:
                out.append("        ref 实际尾部: ...%s" % ref[-46:])
        else:
            out.append("   table 行数=%d" % b["rows"])
    body_left = "```" in "".join(l for l in lines)
    out.append("   正文仍含围栏: %s" % body_left)

out.insert(0, "含围栏段落数: %d" % n)
io.open(r"C:/Users/zelin/WorkBuddy/2026-09-24-12-08-46/ab/verify_fence_out.txt", "w",
        encoding="utf-8").write("\n".join(out))
print("\n".join(out))
