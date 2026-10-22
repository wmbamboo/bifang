#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "已生成 .env，请填入 DEEPSEEK_API_KEY"
fi

mkdir -p data/knowledge_base
export PYTHONPATH="$(pwd)${PYTHONPATH:+:$PYTHONPATH}"
# 本机共用 HF 缓存（与 docuMind 等同项目共用 $HOME/models/huggingface，避免重复占盘）
export HF_HOME="${HF_HOME:-$HOME/models/huggingface}"
mkdir -p "$HF_HOME"
echo "[bifang] HF_HOME=$HF_HOME"
# 跳过 PaddleOCR 模型源连通性探测，加快冷启动
export PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK="${PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK:-True}"
# --no-proxy-headers：禁止 uvicorn 把客户端自带的 XFF 写进 request.client
# （否则本机 curl 伪造头会污染审计；真实 IP 由前端 proxy / nginx 覆盖写 X-Real-IP）
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 7861 --reload --no-proxy-headers
