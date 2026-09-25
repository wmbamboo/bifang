# 毕方智能知识管理平台 · 后端

FastAPI 实现的 LangChain-Chatchat 兼容接口，对接现有 Ant Design Pro 前端。

## 特性

- 知识库：创建/删除、文档上传（PDF/DOCX/PPTX/TXT）
- 检索：**GPU Embedding 向量检索 + BM25 混合检索**（默认 `hybrid`）
- 智能问答 / 知识库问答：DeepSeek 流式生成
- 系统管理：用户 / 角色 / 菜单 / 机构 / 会话
- **不使用 Docker**

## 依赖安装

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# CUDA 版 PyTorch（按本机 CUDA 选择）
pip install torch --index-url https://download.pytorch.org/whl/cu126

# OCR：PaddleOCR-VL-1.5（版面/表格 Markdown）
# 推荐 OCR_VL_ENGINE=transformers，与本机 torch embedding 共用 CUDA，避免 paddlepaddle-gpu 降级 nvidia 库。
pip install -U "paddleocr[doc-parser]>=3.4.0"
pip install -U "transformers>=5.0.0"
# 可选：仅当坚持 paddle 推理后端时再装（会与 torch CUDA 依赖冲突，不推荐）
# pip install paddlepaddle-gpu==3.2.1 -i https://www.paddlepaddle.org.cn/packages/stable/cu126/
```

`.env` 默认：

| 变量 | 说明 |
|------|------|
| `OCR_ENGINE=paddleocr_vl` | 主引擎；失败可改 `rapidocr` |
| `OCR_VL_PIPELINE_VERSION=v1.5` | 对应 PaddleOCR-VL-1.5（亦支持 `v1` / `v1.6`） |
| `OCR_VL_ENGINE=transformers` | VL 推理后端（推荐）；`paddle` 需单独装 paddlepaddle-gpu |

**换 OCR 后**：已入库文档不会自动重解析，需对相关 PDF **重新上传/重建向量** 后，表格口径才会按新 OCR 生效。

### 结构化抽取（JSON 双轨）

入库时同一次解析产物分叉：`parses/{stem}.json`（页段索引）+ `extracts/{stem}.jsonl`（单元格/KPI 归属）+ 向量 chunk（**整表 atomic，不按字数切开**）。

```bash
# 抽取金标（不重跑 OCR）
cd backend && PYTHONPATH=. python -m pytest tests/test_extract_gold.py -v

# 仅回填 JSON 轨（从已有向量块拼页）
PYTHONPATH=. python scripts/backfill_extracts.py 服装 --file 抖音单品爆款分析-商务男士衬衫polo衫.pdf
```

默认 Embedding：`BAAI/bge-large-zh-v1.5`（若本机已有 HuggingFace 缓存会直接复用）。

## 启动

```bash
cp .env.example .env
# 填写 DEEPSEEK_API_KEY
# EMBEDDING_DEVICE=cuda
# RETRIEVAL_MODE=hybrid

./start.sh
```

- 地址：`http://127.0.0.1:7861`
- 文档：`http://127.0.0.1:7861/docs`
- 默认账号：`admin` / `bifang.intronlink`

## 检索模式

| `RETRIEVAL_MODE` | 说明 |
|------------------|------|
| `hybrid` | 向量 + BM25（RRF 融合，推荐） |
| `vector` | 仅语义向量检索 |
| `bm25` | 仅关键词检索 |

上传文档后会自动向量化；旧知识库首次检索时也会尝试补齐向量索引。
