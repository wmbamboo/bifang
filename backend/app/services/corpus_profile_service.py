"""语料画像：KB 级 profile.json 读写 + 从 extracts 粗挖轴/品类词。"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Any, Optional

from app.config import get_settings

# 与 frontend apparel.json 对齐的内置默认（KB 无 profile 时回退）
_BUILTIN_DIR = Path(__file__).resolve().parent.parent / "corpus_profiles"


def kb_profile_path(kb_name: str) -> Path:
    return get_settings().kb_root / kb_name / "assets" / "profile.json"


def load_kb_corpus_profile(kb_name: str) -> dict[str, Any]:
    """优先 KB assets/profile.json；否则内置 apparel；再否则空壳。"""
    if not kb_name:
        return _builtin_profile("apparel")
    path = kb_profile_path(kb_name)
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("id"):
                return data
        except Exception:  # noqa: BLE001
            pass
    # 服装库名启发式
    if re.search(r"服装|衬衫|polo|男装", kb_name, re.I):
        return _builtin_profile("apparel")
    return _builtin_profile("apparel")


def _builtin_profile(name: str) -> dict[str, Any]:
    p = _BUILTIN_DIR / f"{name}.json"
    if p.is_file():
        return json.loads(p.read_text(encoding="utf-8"))
    stub = _BUILTIN_DIR / "digital3c.stub.json"
    if stub.is_file():
        return json.loads(stub.read_text(encoding="utf-8"))
    return {
        "id": name or "empty",
        "version": 1,
        "macroGroupId": "dapan",
        "shareOfMacroIdioms": [],
        "entityGroups": [],
        "categoryGroupIds": [],
        "attrAxes": [],
        "attrPageTitleHints": [],
        "priceBandPageHints": ["价格带"],
        "coverageDetectHints": [],
        "coverageItems": [],
    }


def save_kb_corpus_profile(kb_name: str, profile: dict[str, Any]) -> Path:
    path = kb_profile_path(kb_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(profile, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return path


def mine_profile_from_extracts(kb_name: str) -> dict[str, Any]:
    """从 extracts/*.jsonl 统计 attr_label / price_band / name 频次，粗生成画像草稿。"""
    from app.services.extract_service import kb_extracts_dir

    base = _builtin_profile("apparel")
    base["id"] = f"mined:{kb_name}"
    base["label"] = f"从 {kb_name} extracts 挖掘（草稿，请人工校对）"
    extracts = kb_extracts_dir(kb_name)
    if not extracts.is_dir():
        return base

    labels: Counter[str] = Counter()
    names: Counter[str] = Counter()
    axes: Counter[str] = Counter()
    has_band = 0
    for path in extracts.glob("*.jsonl"):
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            for met in rec.get("metrics") or []:
                if met.get("price_band"):
                    has_band += 1
                if met.get("attr_label"):
                    labels[str(met["attr_label"])] += 1
                if met.get("axis"):
                    axes[str(met["axis"])] += 1
                n = met.get("name")
                if n and n not in {"指标", "价格带", "属性", "商品"}:
                    names[str(n)] += 1

    # 品类实体：高频 name
    cat_words = [w for w, _ in names.most_common(12)]
    if cat_words:
        base["entityGroups"] = [
            {
                "id": "dapan",
                "labelZh": "大盘",
                "words": ["大盘", "总销量", "总销售额"],
            },
            {
                "id": "cat",
                "labelZh": "品类",
                "words": cat_words[:8],
            },
        ]
        base["categoryGroupIds"] = ["cat"]
        base["coverageDetectHints"] = cat_words[:6]

    # 属性轴：已有 axis 计数 + 标签
    if axes:
        mined_axes = []
        top_labs = [w for w, c in labels.most_common(20) if c >= 1]
        for ax, _ in axes.most_common(8):
            if ax in {"销量", "销售额", "价格带"}:
                continue
            mined_axes.append(
                {
                    "axis": ax,
                    "titleHints": [ax],
                    "labels": [lab for lab in top_labs if True][:6] or [ax],
                }
            )
        if mined_axes:
            base["attrAxes"] = mined_axes
            base["attrPageTitleHints"] = [a["axis"] for a in mined_axes] + [
                "属性",
                "面料",
                "材质",
            ]

    if has_band:
        base["priceBandPageHints"] = ["价格带", "价位"]

    base["minedStats"] = {
        "attr_labels": labels.most_common(15),
        "names": names.most_common(12),
        "axes": axes.most_common(10),
        "price_band_metrics": has_band,
    }
    return base
