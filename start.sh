#!/usr/bin/env bash
# X 每日看板一键启动（Apify 数据源）：读取 token → 起看板服务
set -euo pipefail

cd "$(dirname "$0")"
DASH_PORT="${PORT:-8787}"

c_red=$'\033[31m'; c_grn=$'\033[32m'; c_cyn=$'\033[36m'; c_off=$'\033[0m'
ok()  { echo "${c_grn}✓${c_off} $*"; }
die() { echo "${c_red}✗ $*${c_off}" >&2; exit 1; }

command -v python3 >/dev/null || die "未找到 python3"

# 从 .env 读取（若存在），允许环境变量覆盖
if [ -f .env ]; then
  set -a; . ./.env; set +a
  ok "已加载 .env"
fi

[ -n "${TWITTERAPI_KEY:-}" ] || die "未设置 TWITTERAPI_KEY。在 .env 写入 TWITTERAPI_KEY=xxx，或 TWITTERAPI_KEY=xxx ./start.sh"
ok "TWITTERAPI_KEY 已配置"

# 停掉旧进程避免端口冲突
pkill -f "python3 server.py" 2>/dev/null || true
sleep 0.5

ok "启动看板：http://localhost:${DASH_PORT}"
exec python3 server.py
