# 毕方智能知识管理平台

通过 **Chatchat 兼容后端** + **Ant Design Pro 前端** 实现文档上传、智能检索、知识库问答与智能写作。

## 目录

| 目录 | 说明 |
|------|------|
| `frontend/` | Ant Design Pro 前端（标准毕方版） |
| `backend/` | FastAPI 后端（DeepSeek + FAISS/BM25 混合检索） |
| `req/` | 产品白皮书 |

## 功能入口（前端菜单）

| 模块 | 说明 |
|------|------|
| 智能搜索 / 智能问答 / 知识库问答 | 检索与对话 |
| 智能拓展写作 / 知识库写作 | 大纲与文稿、PPT 生成 |
| 知识库管理 / 文件管理 / 用户管理 | 管理员维护 |

## 启动

### 后端

```bash
cd backend
cp .env.example .env   # 填写 DEEPSEEK_API_KEY
./start.sh
```

默认：`http://127.0.0.1:7861`  
账号：`admin` / `bifang.intronlink`

### 前端（需 Linux Node，推荐 nvm Node 20）

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20
cd frontend
npm install
npm start
```

访问：`http://localhost:8000`  
开发代理已指向 `127.0.0.1:7861`（`/chat`、`/knowledge_base`、`/mock_api`）。
