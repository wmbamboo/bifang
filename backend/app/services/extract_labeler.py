"""LLM 只标注：给 OCR 已识别数字贴语义标签，禁止产出新数值。"""
from __future__ import annotations

import json
import re
from typing import Any


def _raw_ok(metric: dict[str, Any], page_text: str) -> bool:
    raw = metric.get("raw_text") or metric.get("raw") or ""
    val = str(metric.get("value") or "")
    if not val:
        return False
    compact_page = (page_text or "").replace(",", "")
    compact_raw = raw.replace(",", "")
    v = val.replace(",", "")
    if v not in compact_raw and v not in compact_page:
        return False
    return True


def _sync_chat(prompt: str, temperature: float = 0.0) -> str:
    from app.services.llm import get_sync_client, resolve_model
    from app.config import get_settings

    settings = get_settings()
    key = (settings.deepseek_api_key or "").strip()
    if not key or key.startswith("sk-your-") or key == "sk-placeholder":
        raise RuntimeError("未配置 DEEPSEEK_API_KEY")
    client = get_sync_client()
    resp = client.chat.completions.create(
        model=resolve_model(None),
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        stream=False,
    )
    return resp.choices[0].message.content or ""


def label_page_metrics(rec: dict[str, Any], page_text: str) -> dict[str, Any]:
    """对 name==指标 的条目调用 LLM 分类；失败则保留原样并记 warning。

    输出校验：value/raw_text 必须在 OCR 原文中逐字存在。
    """
    metrics = list(rec.get("metrics") or [])
    need = [m for m in metrics if m.get("name") == "指标"]
    if not need:
        return rec

    payload = [
        {
            "i": i,
            "value": m.get("value"),
            "unit": m.get("unit"),
            "raw_text": m.get("raw_text") or m.get("raw"),
            "rank_badge": m.get("rank_badge"),
        }
        for i, m in enumerate(metrics)
        if m.get("name") == "指标"
    ]
    scopes = rec.get("scopes") or []
    prompt = (
        "你只做标签分类，禁止改写或编造任何数字。\n"
        f"本页已知实体候选: {scopes}\n"
        "对下列 OCR 条目，从候选中选 name（男装大盘/男士衬衫/polo衫/价格带），"
        "并可选 metric_kind（销量/销售额/同比/环比/占比）。\n"
        "只输出 JSON 数组: [{\"i\":0,\"name\":\"polo衫\",\"metric_kind\":\"销量\"}, ...]\n"
        f"条目: {json.dumps(payload, ensure_ascii=False)}"
    )
    try:
        text = _sync_chat(prompt, temperature=0.0)
    except Exception as ex:  # noqa: BLE001
        warnings = list(rec.get("extract_warnings") or [])
        warnings.append(f"llm_label_failed:{ex}")
        return {**rec, "extract_warnings": warnings}

    m = re.search(r"\[[\s\S]*\]", text or "")
    if not m:
        warnings = list(rec.get("extract_warnings") or [])
        warnings.append("llm_label_parse_failed")
        return {**rec, "extract_warnings": warnings}
    try:
        labels = json.loads(m.group(0))
    except json.JSONDecodeError:
        warnings = list(rec.get("extract_warnings") or [])
        warnings.append("llm_label_json_invalid")
        return {**rec, "extract_warnings": warnings}

    allowed = {"男装大盘", "男士衬衫", "polo衫", "价格带", "T恤"}
    new_metrics = list(metrics)
    warnings = list(rec.get("extract_warnings") or [])
    for item in labels:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("i"))
        except (TypeError, ValueError):
            continue
        if idx < 0 or idx >= len(new_metrics):
            continue
        name = str(item.get("name") or "").strip()
        if name not in allowed:
            continue
        cand = {**new_metrics[idx], "name": name, "label_source": "llm"}
        if item.get("metric_kind"):
            cand["metric_kind"] = str(item["metric_kind"])
        if not _raw_ok(cand, page_text):
            warnings.append(f"llm_label_rejected_i={idx}")
            continue
        new_metrics[idx] = cand
    return {**rec, "metrics": new_metrics, "extract_warnings": warnings}


_ALLOWED_CELL_ROLES = {"header", "metric_name", "value", "rate", "ignore"}


def label_table_cell_roles(
    page_text: str,
    metrics: list[dict[str, Any]],
    table_profiles: list[dict[str, Any]],
    *,
    page_type: str = "general",
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    """歧义表：LLM 只标格子角色，不产数值；用角色回填占位名。

    默认由调用方在 ambiguous 时按需开启。失败则原样返回并记 warning。
    """
    warnings: list[str] = []
    from app.services.table_structure import extract_tables

    tables = extract_tables(page_text)
    if not tables:
        return metrics, table_profiles, ["llm_cell_roles:no_tables"]

    # 只对 ambiguous profile 对应的表标角色
    ambiguous_idxs = [
        i for i, p in enumerate(table_profiles) if p.get("ambiguous")
    ]
    if not ambiguous_idxs:
        return metrics, table_profiles, []

    grid_payload: list[dict[str, Any]] = []
    for ti in ambiguous_idxs:
        if ti >= len(tables):
            continue
        tb = tables[ti]
        cells = []
        for row in tb.rows:
            for c in row:
                cells.append(
                    {
                        "r": c.row,
                        "c": c.col,
                        "text": (c.text or "")[:80],
                    }
                )
        grid_payload.append({"table": ti, "cells": cells[:80]})

    prompt = (
        "你只标注表格单元格角色，禁止改写或编造任何数字/文字。\n"
        "角色仅限: header | metric_name | value | rate | ignore\n"
        f"页类型: {page_type}\n"
        "输出 JSON: [{\"table\":0,\"roles\":[{\"r\":0,\"c\":0,\"role\":\"header\"},...]}]\n"
        f"格子: {json.dumps(grid_payload, ensure_ascii=False)}"
    )
    try:
        text = _sync_chat(prompt, temperature=0.0)
    except Exception as ex:  # noqa: BLE001
        return metrics, table_profiles, [f"llm_cell_roles_failed:{ex}"]

    m = re.search(r"\[[\s\S]*\]", text or "")
    if not m:
        return metrics, table_profiles, ["llm_cell_roles_parse_failed"]
    try:
        labeled = json.loads(m.group(0))
    except json.JSONDecodeError:
        return metrics, table_profiles, ["llm_cell_roles_json_invalid"]

    # 按行收集 metric_name，回填同行列的占位指标
    name_by_table_row: dict[tuple[int, int], str] = {}
    for block in labeled:
        if not isinstance(block, dict):
            continue
        try:
            ti = int(block.get("table"))
        except (TypeError, ValueError):
            continue
        for item in block.get("roles") or []:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "").strip()
            if role not in _ALLOWED_CELL_ROLES:
                continue
            if role != "metric_name":
                continue
            try:
                r, c = int(item["r"]), int(item["c"])
            except (KeyError, TypeError, ValueError):
                continue
            if ti >= len(tables) or r >= len(tables[ti].rows):
                continue
            row = tables[ti].rows[r]
            if c >= len(row):
                continue
            name = (row[c].text or "").strip()
            if name and name_by_table_row.get((ti, r)) is None:
                # 校验：名字须出现在 OCR 原文
                if name in (page_text or "") or name.replace(" ", "") in (
                    page_text or ""
                ).replace(" ", ""):
                    name_by_table_row[(ti, r)] = name[:40]

    new_metrics = list(metrics)
    for i, met in enumerate(new_metrics):
        if met.get("name") != "指标":
            continue
        if not _raw_ok(met, page_text):
            continue
        row = met.get("row")
        if row is None:
            continue
        # 任一张 ambiguous 表的同名行
        for ti in ambiguous_idxs:
            name = name_by_table_row.get((ti, int(row)))
            if name:
                new_metrics[i] = {
                    **met,
                    "name": name,
                    "label_source": "llm_cell_role",
                }
                break

    new_profiles = list(table_profiles)
    for ti in ambiguous_idxs:
        if ti < len(new_profiles):
            new_profiles[ti] = {
                **new_profiles[ti],
                "convention": "llm_roles",
                "ambiguous": False,
                "confidence": max(
                    float(new_profiles[ti].get("confidence") or 0), 0.7
                ),
                "signals": {
                    **(new_profiles[ti].get("signals") or {}),
                    "llm_cell_roles": True,
                    "named_rows": len(name_by_table_row),
                },
            }
    if not name_by_table_row:
        warnings.append("llm_cell_roles:no_metric_name_applied")
    return new_metrics, new_profiles, warnings
