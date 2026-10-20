import zipfile, re, io

P = r'C:\Users\zelin\Desktop\抖音商务衬衫polo选品分析-Ai-v2026920.docx'
z = zipfile.ZipFile(P)
x = z.read('word/document.xml').decode('utf8')

def txt(q):
    return ''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', q, re.S))

tables = re.findall(r'<w:tbl>.*?</w:tbl>', x, re.S)
print('w:tbl 总数:', len(tables))
print('=' * 70)

for i, t in enumerate(tables, 1):
    rows = re.findall(r'<w:tr\b.*?</w:tr>', t, re.S)
    print('\n【表 %d】行数=%d' % (i, len(rows)))
    for j, r in enumerate(rows):
        cells = re.findall(r'<w:tc>.*?</w:tc>', r, re.S)
        vals = []
        for c in cells:
            v = txt(c).strip()
            vals.append(v)
        # 列宽
        w = re.findall(r'<w:gridCol w:w="(\d+)"', t)
        print('  行%d (%d格): %s' % (j, len(cells), ' | '.join(v[:22] for v in vals)))
    grid = re.findall(r'<w:gridCol w:w="(\d+)"', t)
    print('  gridCol:', grid)
    # 是否含管道符残留
    full = txt(t)
    print('  含 | 残留:', '|' in full, ' 含 ``` 残留:', '```' in full)
    print('  单元格文本总长:', len(full))

# 检查文末是否还有 tablecaption 泄漏
paras = re.findall(r'<w:p\b[^>]*>.*?</w:p>', x, re.S)
print('\n' + '=' * 70)
print('含 tablecaption 的段落:')
for i, q in enumerate(paras):
    t = txt(q)
    if 'tablecaption' in t:
        print('  段%d: ...%s' % (i, t[-90:]))
print('\n含 | 管道残留的正文段:')
n = 0
for i, q in enumerate(paras):
    t = txt(q)
    if '|' in t and len(t) > 40:
        n += 1
        if n <= 6:
            print('  段%d: %s' % (i, t[:120]))
print('  合计:', n)
