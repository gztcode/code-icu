/**
 * Code ICU · 本地静态服务器（零依赖）
 *
 * 为什么不用 `python3 -m http.server`：它继承 `socketserver.TCPServer.request_queue_size = 5`
 * 的监听队列长度，而本页一进来就要并行拉 17 个 ES Module，队列溢出时内核直接 RST 掉
 * 排在后面的连接，浏览器表现为「随机一个模块 net::ERR_CONNECTION_RESET」，页面白屏。
 * 真实部署（nginx / CDN）不会有这个问题，但自测时不能让它污染结论。
 *
 * 用法：node tests/serve.mjs [port]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] ?? 8080);
// 路径里带中文（比赛），必须走 fileURLToPath 解码，否则 readFile 一定 ENOENT
const ROOT = fileURLToPath(new URL('../src/', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = path === '/' ? 'index.html' : normalize(path).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(ROOT, file));
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Code ICU · http://127.0.0.1:${PORT}/ (root: src/)`);
});
