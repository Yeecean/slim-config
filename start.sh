#!/usr/bin/env bash
# Slim Config 一键启动脚本 (Linux / macOS)
# 用法: ./start.sh [--port 8080] [--host 127.0.0.1] [--config-dir <路径>]
# 参数将原样透传给 backend/main.py
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

echo "Slim Config v1.0.0"
echo

if ! command -v python3 >/dev/null 2>&1; then
    echo "错误: 未找到 python3，请先安装 Python 3.10+" >&2
    echo "  Debian/Ubuntu: sudo apt install python3 python3-venv" >&2
    echo "  Fedora/RHEL:   sudo dnf install python3" >&2
    exit 1
fi

venv_dir="$script_dir/.venv"
if [ ! -x "$venv_dir/bin/python" ]; then
    echo "首次运行: 创建虚拟环境 $venv_dir ..."
    python3 -m venv "$venv_dir"
fi

echo "检查并安装后端依赖..."
"$venv_dir/bin/pip" install -q -r backend/requirements.txt

echo
echo "启动服务..."
exec "$venv_dir/bin/python" backend/main.py "$@"
