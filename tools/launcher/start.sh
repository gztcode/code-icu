#!/bin/bash
# Code ICU · Linux 一键启动
# 给文件加执行权限后运行：bash start.sh   （或直接在文件管理器里双击并选择运行）
cd "$(dirname "$0")" || exit 1

PORT=8765
URL="http://127.0.0.1:${PORT}/"

open_browser() {
  sleep 1
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  elif command -v sensible-browser >/dev/null 2>&1; then
    sensible-browser "$URL" >/dev/null 2>&1 &
  fi
}

if command -v node >/dev/null 2>&1; then
  open_browser
  exec node server.mjs "$PORT"
elif command -v python3 >/dev/null 2>&1; then
  open_browser
  exec python3 serve.py "$PORT" code-icu
elif command -v python >/dev/null 2>&1; then
  open_browser
  exec python serve.py "$PORT" code-icu
else
  echo ""
  echo "[Code ICU] 没找到 Node.js，也没找到 Python 3。"
  echo ""
  echo "两种办法二选一："
  echo "  1. 装 Node.js：https://nodejs.org/  （装完重新运行本脚本）"
  echo "  2. 直接用在线版：https://gztcode.github.io/code-icu/"
  echo ""
  read -r -p "按回车键退出…" _
  exit 1
fi
