"""任务 3 第 2 步：排序 JSON（从既有指标聚合，不另起 OCR 产物）。"""

from __future__ import annotations

from app.services.table_structure import (
    build_rankings_from_metrics,
    _attr_axis_of_label,
)


def test_常规_maps_to_sleeve_axis():
    assert _attr_axis_of_label("常规") == "袖型"
    assert _attr_axis_of_label("常规袖") == "袖型"


def test_build_rankings_sleeve_top_is_常规_not_落肩():
    """B3：常规 79.76 与误配常规袖 1.50 并存时，排名第一须为常规。"""
    metrics = [
        {
            "attr_label": "落肩袖",
            "value": "15.06",
            "unit": "%",
            "axis": "袖型",
        },
        {
            "attr_label": "灯笼袖",
            "value": "1.67",
            "unit": "%",
            "axis": "袖型",
        },
        {
            "attr_label": "常规袖",
            "value": "1.50",
            "unit": "%",
            "axis": "袖型",
        },
        {
            "attr_label": "插肩袖",
            "value": "1.38",
            "unit": "%",
            "axis": "袖型",
        },
        {
            "attr_label": "常规",
            "value": "79.76",
            "unit": "%",
            # OCR 截断无 axis 时靠词表推断
        },
    ]
    rankings = build_rankings_from_metrics(metrics)
    sleeve = next(r for r in rankings if r["dim"] == "袖型")
    assert sleeve["top"]["name"] == "常规"
    assert sleeve["top"]["pct"] == 79.76
    names = [it["name"] for it in sleeve["items"]]
    assert "常规袖" not in names  # 被「常规」高 pct 去重掉
    assert names[0] == "常规"
    assert names[1] == "落肩袖"


def test_extract_page_record_includes_rankings():
    from app.services.extract_service import extract_page_record

    text = (
        "## 属性特征\n袖型\n"
        "常规 79.76%\n落肩袖 15.06%\n灯笼袖 1.67%\n常规袖 1.50%\n插肩袖 1.38%\n"
    )
    rec = extract_page_record("demo.pdf", 6, text)
    assert rec.get("rankings")
    sleeve = next(r for r in rec["rankings"] if r["dim"] == "袖型")
    assert sleeve["top"]["pct"] == 79.76
