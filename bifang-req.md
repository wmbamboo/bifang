# 产品实现路径

通过 LangChain-Chatchat 兼容后端 + Ant Design Pro 前端实现文档上传、智能检索、智能问答/写作等功能。

## 现状

- 前端：`frontend/`（已对接 Chatchat 风格 API）
- 后端：`backend/`（FastAPI，DeepSeek 大模型，BM25 检索，无 Docker）
- 白皮书：`req/标准版-《毕方智能知识管理平台技术白皮书》v4.0.docx`

## 启动摘要

```bash
# 后端
cd backend && cp .env.example .env   # 填写 DEEPSEEK_API_KEY
./start.sh

# 前端
cd frontend && bf_baseUrl=http://127.0.0.1:7861 npm start
```

默认账号：`admin` / `bifang.intronlink`
