import zipfile, re

P = r'C:\Users\zelin\Desktop\抖音商务衬衫polo选品分析-Ai-v2026920.docx'
z = zipfile.ZipFile(P)
x = z.read('word/document.xml').decode('utf8')

T = re.compile(r'<w:t(?: [^>]*)?>(.*?)</w:t>', re.S)
BR = re.compile(r'<w:(?:br|cr)\b[^>]*/?>')
paras = re.findall(r'<w:p\b[^>]*>.*?</w:p>', x, re.S)


def linear(q):
    """按 XML 出现顺序还原：<w:t> 取文本，<w:br/> 记换行"""
    out = []
    pos = 0
    for m in re.finditer(r'<w:t(?: [^>]*)?>.*?</w:t>|<w:(?:br|cr)\b[^>]*/?>', q, re.S):
        seg = m.group(0)
        if seg.startswith('<w:br') or seg.startswith('<w:cr'):
            out.append('\n')
        else:
            mm = T.match(seg)
            if mm:
                out.append(mm.group(1))
    return ''.join(out)


for i, q in enumerate(paras):
    t = linear(q)
    if '```' not in t:
        continue
    nbr = len(BR.findall(q))
    print('\n段 %d  br=%d  文本长度=%d  换行数=%d' % (i, nbr, len(t), t.count('\n')))
    print('全文:')
    print(t.replace('\n', '\\n'))
    print('-' * 70)
