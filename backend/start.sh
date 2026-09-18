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
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 7861 --reload
