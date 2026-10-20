import zipfile, re, io

P = r'C:\Users\zelin\Desktop\抖音商务衬衫polo选品分析-Ai-v2026920.docx'
z = zipfile.ZipFile(P)
x = z.read('word/document.xml').decode('utf8')

# 修正：<w:t> 或 <w:t xml:space="preserve">，不匹配 <w:tcPr>
T = re.compile(r'<w:t(?: [^>]*)?>(.*?)</w:t>', re.S)

def txt(q):
    return ''.join(T.findall(q))

# 计数校验
print('原始 <w:tbl> 计数:', x.count('<w:tbl>'))
print('原始 </w:tbl> 计数:', x.count('</w:tbl>'))
print('完整表匹配数:', len(re.findall(r'<w:tbl>.*?</w:tbl>', x, re.S)))
print('全文汉字(修正后):', len(re.findall(r'[\u4e00-\u9fff]', txt(x))))
print('全文汉字(错误正则):', len(re.findall(r'[\u4e00-\u9fff]', ''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', x, re.S)))))
print('=' * 70)

tables = re.findall(r'<w:tbl>.*?</w:tbl>', x, re.S)
for i, t in enumerate(tables, 1):
    rows = re.findall(r'<w:tr\b.*?</w:tr>', t, re.S)
    print('\n【表 %d】行数=%d  gridCol=%s' % (i, len(rows), re.findall(r'<w:gridCol w:w="(\d+)"', t)))
    for j, r in enumerate(rows):
        cells = re.findall(r'<w:tc>.*?</w:tc>', r, re.S)
        vals = [txt(c).strip() for c in cells]
        print('  行%d: %s' % (j, ' | '.join(v[:26] for v in vals)))
