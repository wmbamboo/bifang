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
