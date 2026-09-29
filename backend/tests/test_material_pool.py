"""任务 4B 验收：材料池互斥分配（不依赖真实向量库）。"""

from __future__ import annotations

import ast
from pathlib import Path

from app.services.material_pool import (
    ChapterSpec,
    allocate_material_pool,
    stable_material_key,
)

ROOT = Path(__file__).resolve().parents[1]
POOL_SRC = ROOT / "app" / "services" / "material_pool.py"


def _doc(
    source: str,
    chunk: int,
    text: str,
    *,
    page: int | None = None,
    score: float = 0.5,
) -> dict:
    meta = {"kb_name": "服装", "source": source, "chunk": chunk}
    if page is not None:
        meta["page"] = page
    return {
        "page_content": text,
        "metadata": meta,
        "score": score,
        "vector_score": score,
    }


def _five_chapters() -> list[ChapterSpec]:
    return [
        ChapterSpec("c1", "大盘与类目机会", ["规模", "增速"]),
        ChapterSpec("c2", "证据与货盘对照", ["热销", "结构"]),
        ChapterSpec("c3", "价格带与客群", ["价格带", "客群"]),
        ChapterSpec("c4", "风险与不选什么", ["风险", "不选"]),
        ChapterSpec("c5", "选品结论与动作", ["结论", "动作"]),
    ]


def _pool_60() -> list[dict]:
    """60 片候选：含一枚「价格带」专属 chunk，其余按章题词面铺开。"""
    pool: list[dict] = []
    themes = [
        ("大盘规模增速类目", "大盘.pdf"),
        ("热销货盘结构对照", "货盘.pdf"),
        ("价格带客群分层销量", "价格带.pdf"),
        ("风险信号明确不选", "风险.pdf"),
        ("结论动作跟进方向", "结论.pdf"),
        ("杂项辅料物流仓储", "杂项.pdf"),
    ]
    # 固定价格带金标片（验收 2）
    pool.append(
        _doc(
            "价格带专表.pdf",
            0,
            "男士衬衫价格带本期销量：¥50-100 占比 32%，¥100-200 占比 41%。",
            page=1,
            score=0.9,
        )
    )
    n = 1
    while len(pool) < 60:
        text, src = themes[n % len(themes)]
        pool.append(
            _doc(
                src,
                n,
                f"{text} 片段{n} 补充描述与指标。",
                page=n,
                score=0.4 + (n % 5) * 0.05,
            )
        )
        n += 1
    return pool


def test_allocate_each_chunk_once_and_chapter_coverage():
    chapters = _five_chapters()
    pool = _pool_60()
    result = allocate_material_pool(chapters, pool, max_per_chapter=8, min_per_chapter=1)

    all_assigned: list[str] = []
    for keys in result.by_chapter.values():
        all_assigned.extend(keys)
    assert len(all_assigned) == len(set(all_assigned)), "每片最多分配 1 次"

    pool_keys = {stable_material_key(d) for d in pool}
    for ch in chapters:
        keys = result.by_chapter[ch.chapter_id]
        # 池内存在可匹配片段时，每章至少 1 片
        assert len(keys) >= 1, f"{ch.chapter_id} 应至少 1 片"
        assert all(k in pool_keys for k in keys)


def test_price_band_chunk_in_exactly_one_chapter():
    chapters = _five_chapters()
    pool = _pool_60()
    price_key = stable_material_key(pool[0])
    assert "价格带" in pool[0]["page_content"]

    result = allocate_material_pool(chapters, pool, max_per_chapter=8, min_per_chapter=1)
    owners = [
        cid for cid, keys in result.by_chapter.items() if price_key in keys
    ]
    assert len(owners) == 1, f"价格带 chunk 应只属 1 章，实际 {owners}"
    # 词面应偏向「价格带与客群」章
    assert owners[0] == "c3"


def test_unused_list_complete():
    chapters = _five_chapters()
    pool = _pool_60()
    result = allocate_material_pool(chapters, pool, max_per_chapter=4, min_per_chapter=1)

    assigned = {k for keys in result.by_chapter.values() for k in keys}
    pool_keys = [stable_material_key(d) for d in pool]
    # 去重后的全集
    uniq = []
    seen = set()
    for k in pool_keys:
        if k not in seen:
            seen.add(k)
            uniq.append(k)
    assert set(result.unused) == set(uniq) - assigned
    assert not (set(result.unused) & assigned)


def test_allocator_does_not_import_domain_lexicon():
    """4B.6 / 4B.7.4：分配打分模块不得 import 领域词表常量。"""
    tree = ast.parse(POOL_SRC.read_text(encoding="utf-8"))
    imports: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            imports.append(mod)
            for alias in node.names:
                imports.append(f"{mod}.{alias.name}")

    banned_substrings = (
        "corpus_profile",
        "男装大盘",
        "plan_writing_retrieval",
        "kb_service",
        "_GRASS",
        "apparel",
    )
    blob = " ".join(imports)
    for bad in banned_substrings:
        assert bad not in blob, f"material_pool 禁止依赖 {bad}，实际 imports={imports}"

    src = POOL_SRC.read_text(encoding="utf-8")
    for bad in ("男装大盘", "男士衬衫", "polo衫", "价格带"):
        # 模块源码正文也不得硬编码这些领域词作打分路由（测试夹具除外——本文件才是夹具）
        assert bad not in src, f"material_pool.py 不应出现领域词 {bad}"
