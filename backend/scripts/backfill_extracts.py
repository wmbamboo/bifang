#!/usr/bin/env python3
"""从已入向量库的 chunk 回填 extracts + parse artifact（不重跑 OCR）。

用法:
  cd backend && PYTHONPATH=. python scripts/backfill_extracts.py 服装
  PYTHONPATH=. python scripts/backfill_extracts.py 服装 --file 抖音单品爆款分析-商务男士衬衫polo衫.pdf
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("kb_name")
    ap.add_argument("--file", default="", help="只回填该文件名；默认库内全部有向量的源")
    args = ap.parse_args()

    from app.services.extract_service import backfill_from_store
    from app.services.kb_service import get_store

    store = get_store(args.kb_name)
    sources = sorted(
        {
            str((d.get("metadata") or {}).get("source") or "")
            for d in store.docs
            if (d.get("metadata") or {}).get("source")
        }
    )
    if args.file:
        sources = [s for s in sources if s == args.file]
    if not sources:
        print("无源文件可回填", file=sys.stderr)
        return 1
    for src in sources:
        n = backfill_from_store(args.kb_name, src)
        print(f"OK {src} pages={n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
