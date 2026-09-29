"""任务 5 · 引用格式统一（十·5：禁盲映射）。

唯一目标格式：`[文档N]`（N 为检索序号）。
- 仅有裸 `[N]` 且能判定序号合法 → 归一为 `[文档N]`
- 已与 `[文档N]` 混用 → **删除**裸 `[N]`（不猜测映射）
- 非法序号（超出 doc_count）→ 删除
"""

from __future__ import annotations

import re
from typing import Any, Optional

# 已是目标格式
_DOC_CITE_RE = re.compile(r"\[文档(\d+)\]")
# 裸 [N]：前面不是「文档」（避免吃到 [文档12] 的尾巴）
_BARE_CITE_RE = re.compile(r"(?<!文档)\[(\d+)\]")


def normalize_citations(
    text: str,
    *,
    doc_count: Optional[int] = None,
) -> tuple[str, dict[str, Any]]:
    """
    返回 (归一后正文, report)。
    report: mapped / removed / had_doc_cites / had_bare_cites
    """
    src = text or ""
    report: dict[str, Any] = {
        "mapped": 0,
        "removed": 0,
        "had_doc_cites": bool(_DOC_CITE_RE.search(src)),
        "had_bare_cites": bool(_BARE_CITE_RE.search(src)),
    }
    if not report["had_bare_cites"]:
        return src, report

    # 混用：不能判定裸编号语义 → 删除裸引用
    if report["had_doc_cites"]:

        def _strip_bare(m: re.Match[str]) -> str:
            report["removed"] += 1
            return ""

        out = _BARE_CITE_RE.sub(_strip_bare, src)
        # 清理删除后可能留下的多余空白
        out = re.sub(r"[ \t]{2,}", " ", out)
        out = re.sub(r" +([，。；！？、])", r"\1", out)
        return out, report

    # 仅裸引用：合法序号才映射，否则删除
    def _map_or_drop(m: re.Match[str]) -> str:
        n = int(m.group(1))
        if doc_count is not None and (n < 1 or n > int(doc_count)):
            report["removed"] += 1
            return ""
        if n < 1:
            report["removed"] += 1
            return ""
        report["mapped"] += 1
        return f"[文档{n}]"

    out = _BARE_CITE_RE.sub(_map_or_drop, src)
    return out, report


def count_bare_citations(text: str) -> int:
    return len(_BARE_CITE_RE.findall(text or ""))
