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
