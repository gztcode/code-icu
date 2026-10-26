#!/usr/bin/env python3
"""Code ICU · 零依赖本地静态服务器（Python 版兜底）

用法：python3 serve.py [端口] [根目录]

为什么不用 `python3 -m http.server`：它继承 socketserver.TCPServer，
监听队列长度只有 5。而本页一进来就要并行拉 30+ 个 ES Module，队列溢出时
内核直接 RST 掉排在后面的连接，浏览器表现为「随机一个模块
net::ERR_CONNECTION_RESET」，页面白屏 —— 且时好时坏，极难排查。
真实部署（nginx / CDN）没有这个问题，但自测和桌面包不能踩这个坑。

所以这里把队列放大到 128，并改用线程模型，避免一个慢请求卡住其余请求。
"""

import http.server
import os
import socketserver
import sys

# 关键：放大监听队列，否则并行加载模块时会出现随机白屏
socketserver.TCPServer.request_queue_size = 128

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ROOT = (
    sys.argv[2]
    if len(sys.argv) > 2
    else os.path.join(os.path.dirname(os.path.abspath(__file__)), "code-icu")
)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        pass  # 安静模式，别刷屏


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Code ICU 已启动：http://127.0.0.1:{PORT}/")
        print("关闭这个窗口即可停止服务。")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
