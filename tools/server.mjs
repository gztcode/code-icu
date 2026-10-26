/**
 * Code ICU · 零依赖本地静态服务器
 *
 * 用途：桌面压缩包解压后双击启动脚本，本脚本负责把 `code-icu/` 目录用 HTTP
 * 伺服起来并打开浏览器。
 *
 * 为什么不能用 `file://` 直接打开 index.html：页面用的是原生 ES Module，
 * Chrome / Safari 在 file:// 下会以 CORS 为由拒绝加载模块脚本（origin 为 null），
 * 页面直接白屏。所以必须起一个本地 HTTP 服务。
 *
 * 用法：node server.mjs [端口]      默认 8765
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'code-icu');
const PORT = Number(process.argv[2]) || 8765;
const HOST = '127.0.0.1';

/** MIME 表。`.js` 必须是 text/javascript，否则浏览器会以 MIME 不符拒绝 ES Module。 */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function safeJoin(root, urlPath) {
  // 归一化后必须仍在 root 之内，挡掉 ../ 穿越
  const target = normalize(join(root, decodeURIComponent(urlPath)));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = new URL(req.url, `http://${HOST}:${PORT}`).pathname;
    let file = safeJoin(ROOT, urlPath === '/' ? '/index.html' : urlPath);
    if (!file) {
      res.writeHead(403).end('403');
      return;
    }

    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      file = join(file, 'index.html');
      info = await stat(file).catch(() => null);
    }
    if (!info?.isFile()) {
      // 单页应用：未知路径回首页（Hash 路由本来也不会命中这里）
      file = join(ROOT, 'index.html');
      info = await stat(file).catch(() => null);
      if (!info?.isFile()) {
        res.writeHead(404).end('404');
        return;
      }
    }

    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': body.length,
      // 本地开发不过期，改完刷新就能看到
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500).end(String(error?.message ?? error));
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用。换一个端口：node server.mjs 8080`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Code ICU 已启动：http://${HOST}:${PORT}/`);
  console.log('关闭这个窗口即可停止服务。');
});
