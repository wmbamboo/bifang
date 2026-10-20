import zipfile, re, io

P = r'C:\Users\zelin\Desktop\抖音商务衬衫polo选品分析-Ai-v2026920.docx'
z = zipfile.ZipFile(P)
x = z.read('word/document.xml').decode('utf8')
sty = z.read('word/styles.xml').decode('utf8')

GOOD = re.compile(r'<w:t(?: [^>]*)?>(.*?)</w:t>', re.S)
BAD = re.compile(r'<w:t[^>]*>(.*?)</w:t>', re.S)
HAN = re.compile(r'[\u4e00-\u9fff]')

def nm(sid):
    m = re.search(r'<w:style [^>]*w:styleId="%s"[^>]*>(.*?)</w:style>' % re.escape(sid), sty, re.S)
    if not m:
        return sid
    g = re.search(r'<w:name w:val="([^"]+)"', m.group(1))
    return g.group(1) if g else sid

paras = re.findall(r'<w:p\b[^>]*>.*?</w:p>', x, re.S)

cur = None
rows = []
for q in paras:
    ps = re.search(r'<w:pStyle w:val="([^"]+)"', q)
    n = nm(ps.group(1)) if ps else 'Normal'
    t = ''.join(GOOD.findall(q))
    if n.startswith('heading'):
        cur = t.strip()
        continue
    if len(t) > 60 and cur:
        tb = ''.join(BAD.findall(q))
        rows.append((cur, len(HAN.findall(t)), len(HAN.findall(tb)), t))

print('段数:', len(rows))
print('%-34s %7s %7s %8s' % ('段标题', '修正后', '错误值', '偏差'))
tot_g = tot_b = 0
leak_g = 0
for title, g, b, t in rows:
    tot_g += g
    tot_b += b
    print('%-34s %7d %7d %+8.0f%%' % (title[:32], g, b, (g - 297.7) / 297.7 * 100))
print('-' * 60)
print('均值  修正后 %.1f  错误值 %.1f  目标 297.7' % (tot_g / len(rows), tot_b / len(rows)))
print('均值偏差 修正后 %+.1f%%   错误值 %+.1f%%' % (
    (tot_g / len(rows) - 297.7) / 297.7 * 100, (tot_b / len(rows) - 297.7) / 297.7 * 100))

hit_g = sum(1 for _, g, _, _ in rows if abs(g - 297.7) / 297.7 <= 0.2)
hit_b = sum(1 for _, _, b, _ in rows if abs(b - 297.7) / 297.7 <= 0.2)
print('命中率(±20%%)  修正后 %d/%d   错误值 %d/%d' % (hit_g, len(rows), hit_b, len(rows)))

# 去围栏后
import re as _re
dev = 0
for title, g, b, t in rows:
    clean = _re.sub(r'```.*?```', '', t, flags=_re.S)
    clean = _re.sub(r'```.*', '', clean, flags=_re.S)
    dev += len(HAN.findall(clean))
print('剔除围栏文本后 均值 %.1f  偏差 %+.1f%%' % (dev / len(rows), (dev / len(rows) - 297.7) / 297.7 * 100))
