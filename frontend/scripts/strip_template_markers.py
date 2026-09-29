#!/usr/bin/env python3
"""清除 pptTemplate-simple.pptx 页内右上角 progress*/List*/imageList* 维护小字。"""
from __future__ import annotations

import io
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PPTX = ROOT / "public" / "pptTemplate-simple.pptx"
MARKER = re.compile(r"^(?:progress|list|imageList)\d*(?:-\d+)?$", re.I)


def plain_text(sp: str) -> str:
    return "".join(re.findall(r"<a:t[^>]*>([^<]*)</a:t>", sp)).strip()


def strip_markers(xml: str) -> tuple[str, int]:
    parts: list[str] = []
    pos = 0
    n = 0
    for m in re.finditer(r"<p:sp\b[\s\S]*?</p:sp>", xml):
        parts.append(xml[pos : m.start()])
        sp = m.group(0)
        if MARKER.match(plain_text(sp)):
            n += 1
        else:
            parts.append(sp)
        pos = m.end()
    parts.append(xml[pos:])
    return "".join(parts), n


def main() -> None:
    if not PPTX.is_file():
        raise SystemExit(f"missing {PPTX}")
    bak = PPTX.with_suffix(".pptx.bak-markers")
    if not bak.exists():
        shutil.copy2(PPTX, bak)
    buf = io.BytesIO()
    total = 0
    with zipfile.ZipFile(PPTX, "r") as zin, zipfile.ZipFile(
        buf, "w", compression=zipfile.ZIP_DEFLATED
    ) as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if re.match(r"ppt/slides/slide\d+\.xml$", info.filename):
                xml = data.decode("utf-8")
                new_xml, n = strip_markers(xml)
                if n:
                    total += n
                    print(f"{info.filename}: removed {n}")
                    data = new_xml.encode("utf-8")
            zi = zipfile.ZipInfo(filename=info.filename, date_time=info.date_time)
            zi.compress_type = info.compress_type
            zi.external_attr = info.external_attr
            zout.writestr(zi, data)
    PPTX.write_bytes(buf.getvalue())
    print(f"done, removed {total} markers")


if __name__ == "__main__":
    main()
