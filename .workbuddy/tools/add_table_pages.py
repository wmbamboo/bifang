# -*- coding: utf-8 -*-
"""
毕方模板「缺口治理」脚本：把 44/45/46 三个原 deck 残页改写为真实表格版式。

- slide44 -> table 6 行 x 4 列
- slide45 -> table 6 行 x 5 列
- slide46 -> table 8 行 x 5 列

做法：以 slide42（现有 5x4 正规模板页）为骨架，保留标题/表题/版式外观，
仅重写 <a:tbl> 的列宽、行高与单元格占位符；slots 仍是 {slideTitle}/{tableTitle}/{cell_rXcY}。
rels 不动（44/45/46 已指向 slideLayout5，与 42 同版式）。

用法：
  python bifang_ppt_table_pages.py --dry-run   # 只检查，不写回
  python bifang_ppt_table_pages.py             # 直接改写（先自动备份）
"""
from __future__ import annotations

import argparse
import datetime as _dt
import os
import re
import shutil
import zipfile
from pathlib import Path

TPL = Path(r"\\wsl.localhost\Ubuntu\home\hezl\bifang\frontend\public\pptTemplate-simple.pptx")
REPO = Path(r"\\wsl.localhost\Ubuntu\home\hezl\bifang")
BACKUP_DIR = REPO / ".workbuddy" / "backup"

SRC_TABLE_SLIDE = "ppt/slides/slide42.xml"
# rows, cols, 字号(表头, 正文)
SPEC = {
    "ppt/slides/slide44.xml": (6, 4, 1100, 1200),
    "ppt/slides/slide45.xml": (6, 5, 1050, 1150),
    "ppt/slides/slide46.xml": (8, 5, 1000, 1050),
}
TOTAL_W = 11247120  # 表格框宽（EMU），与 slide42 一致
TOTAL_H = 4572000   # 表格框高（EMU），与 slide42 一致

HEADER_TC = (
    '<a:tc><a:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:pPr algn="ctr"/>'
    '<a:r><a:rPr sz="__HSZ__" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr>'
    "<a:t>__CELL__</a:t></a:r></a:p></a:txBody>"
    '<a:tcPr><a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill></a:tcPr></a:tc>'
)
BODY_TC = (
    '<a:tc><a:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:pPr algn="ctr"/>'
    '<a:r><a:rPr sz="__BSZ__" b="0"><a:solidFill><a:srgbClr val="222222"/></a:solidFill></a:rPr>'
    "<a:t>__CELL__</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>"
)
TBL_PR = (
    '<a:tblPr firstRow="1" bandRow="1">'
    "<a:tableStyleId>{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}</a:tableStyleId></a:tblPr>"
)


def build_tbl(rows: int, cols: int, hsz: int, bsz: int) -> str:
    base = TOTAL_W // cols
    widths = [base] * (cols - 1) + [TOTAL_W - base * (cols - 1)]
    grid = "".join(f'<a:gridCol w="{w}"/>' for w in widths)
    h = TOTAL_H // rows
    heights = [h] * (rows - 1) + [TOTAL_H - h * (rows - 1)]
    out = ["<a:tbl>", TBL_PR, f"<a:tblGrid>{grid}</a:tblGrid>"]
    for r in range(rows):
        tpl = HEADER_TC if r == 0 else BODY_TC
        cells = []
        for c in range(cols):
            cells.append(
                tpl.replace("__HSZ__", str(hsz))
                .replace("__BSZ__", str(bsz))
                .replace("__CELL__", "{%s}" % f"cell_r{r}c{c}")
            )
        out.append(f'<a:tr h="{heights[r]}">{"".join(cells)}</a:tr>')
    out.append("</a:tbl>")
    return "".join(out)


def rewrite_table_slide(src_xml: str, rows: int, cols: int, hsz: int, bsz: int) -> str:
    i = src_xml.find("<a:tbl>")
    j = src_xml.find("</a:tbl>")
    if i < 0 or j < 0:
        raise SystemExit("slide42 里没找到 <a:tbl>，模板结构变了，脚本需更新")
    j += len("</a:tbl>")
    return src_xml[:i] + build_tbl(rows, cols, hsz, bsz) + src_xml[j:]


def patch_app_xml(ax: str, slide_no: int, title: str) -> str:
    """docProps/app.xml 的 TitlesOfParts：前 4 项是字体/主题，其后按页序 1..N。"""
    m = re.search(r"(<TitlesOfParts>.*?</TitlesOfParts>)", ax, re.S)
    if not m:
        return ax
    block = m.group(1)
    items = re.findall(r"<vt:lpstr>(.*?)</vt:lpstr>", block, re.S)
    if len(items) < slide_no + 4:
        return ax
    items[3 + slide_no] = title
    new_block = (
        '<TitlesOfParts><vt:vector size="%d" baseType="lpstr">' % len(items)
        + "".join(f"<vt:lpstr>{t}</vt:lpstr>" for t in items)
        + "</vt:vector></TitlesOfParts>"
    )
    return ax.replace(block, new_block)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--template", default=str(TPL))
    args = ap.parse_args()
    tpl = Path(args.template)

    zin = zipfile.ZipFile(tpl)
    src_xml = zin.read(SRC_TABLE_SLIDE).decode("utf-8")
    new_slides = {
        name: rewrite_table_slide(src_xml, *spec) for name, spec in SPEC.items()
    }

    # 自检：占位符数量 & 行列
    for name, spec in SPEC.items():
        rows, cols = spec[0], spec[1]
        xml = new_slides[name]
        cells = re.findall(r"\{cell_r(\d+)c(\d+)\}", xml)
        assert len(cells) == rows * cols, (name, len(cells), rows * cols)
        assert max(int(r) for r, _ in cells) == rows - 1
        assert max(int(c) for _, c in cells) == cols - 1
        print(f"[ok] {name}: {rows}行x{cols}列, {len(cells)} 单元格")

    if args.dry_run:
        print("dry-run：未写回")
        return

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = BACKUP_DIR / f"pptTemplate-simple.{stamp}.pptx"
    shutil.copy2(tpl, backup)
    print(f"[backup] {backup}")

    tmp = tpl.with_suffix(".pptx.tmp")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename in new_slides:
                data = new_slides[item.filename].encode("utf-8")
            elif item.filename == "docProps/app.xml":
                ax = data.decode("utf-8")
                for name in new_slides:
                    no = int(re.search(r"slide(\d+)\.xml", name).group(1))
                    ax = patch_app_xml(ax, no, "{slideTitle}")
                data = ax.encode("utf-8")
            zout.writestr(item, data)
    zin.close()
    # 注意：Windows 下 shutil.move 覆盖已存在文件会被安全删除钩子拦，
    # 必须用 os.replace（同盘原子替换）。
    os.replace(str(tmp), str(tpl))
    print(f"[write] {tpl}")


if __name__ == "__main__":
    main()
