#!/bin/bash
# Code ICU · macOS 一键启动
# 双击本文件即可（首次可能需要在「系统设置 → 隐私与安全性」里放行一次）。
cd "$(dirname "$0")" || exit 1

PORT=8765
URL="http://127.0.0.1:${PORT}/"

if command -v node >/dev/null 2>&1; then
  (sleep 1; open "$URL") &
  exec node server.mjs "$PORT"
elif command -v python3 >/dev/null 2>&1; then
  (sleep 1; open "$URL") &
  exec python3 serve.py "$PORT" code-icu
elif command -v python >/dev/null 2>&1; then
  (sleep 1; open "$URL") &
  exec python serve.py "$PORT" code-icu
else
  echo ""
  echo "[Code ICU] 没找到 Node.js，也没找到 Python 3。"
  echo ""
  echo "两种办法二选一："
  echo "  1. 装 Node.js：https://nodejs.org/  （装完重新双击本文件）"
  echo "  2. 直接用在线版：https://gztcode.github.io/code-icu/"
  echo ""
  read -r -p "按回车键退出…" _
  exit 1
fi
