/**
 * 桌面包冒烟测试：解压发行包 → 起本地服务器 → 用真实浏览器验证。
 *
 * 验证的是「别人拿到压缩包解压双击之后到底能不能用」，覆盖：
 *   页面渲染 / PWA manifest / Service Worker / 缓存 / 交互 / 零 JS 报错
 *
 * 用法：
 *   node tools/pack-release.mjs && node tests/package-smoke.mjs
 *   node tests/package-smoke.mjs /path/to/解压后的目录
 *
 * 依赖 Playwright（与 ui-check.mjs 同一套）。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PKG_SMOKE_PORT || 8899);
const BASE = `http://127.0.0.1:${PORT}/`;

/** 待测目录：命令行给的，或从 dist/ 里解压最新的 macos 包 */
function resolveTarget() {
  const given = process.argv[2];
  if (given) return given;

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const zip = join(ROOT, 'dist', `code-icu-${pkg.version}-macos.zip`);
  if (!existsSync(zip)) {
    console.error(`找不到 ${zip}，先跑 node tools/pack-release.mjs`);
    process.exit(1);
  }
  const work = '/tmp/code-icu-package-smoke';
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  spawn('unzip', ['-q', zip, '-d', work], { stdio: 'inherit' });
  return work;
}

const target = resolveTarget();
const serverDir = existsSync(join(target, 'server.mjs'))
  ? target
  : join(target, `code-icu-${JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version}-macos`);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

// 起本地服务器
const server = spawn('node', [join(serverDir, 'server.mjs'), String(PORT)], {
  cwd: serverDir,
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(d));

// 等端口就绪
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('服务器启动超时')), 10000);
  server.stdout.on('data', () => {
    clearTimeout(timer);
    resolve();
  });
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

try {
  console.log(`\n[1] 页面渲染 ${BASE}`);
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('.hero h1', { timeout: 15000 });
  check('首页主标题渲染', (await page.textContent('.hero h1')).trim().length > 0);
  check('示例按钮存在', (await page.locator('.case').count()) >= 3);

  console.log('\n[2] PWA manifest');
  const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
  check('index.html 引用了 manifest', !!manifestHref, manifestHref ?? '(无)');
  const manifest = await page.evaluate(async (href) => {
    const res = await fetch(href);
    return { status: res.status, body: await res.json() };
  }, manifestHref);
  check('manifest 可加载且是合法 JSON', manifest.status === 200 && !!manifest.body.name, manifest.body?.name);
  check('manifest 声明了图标', (manifest.body.icons ?? []).length >= 2, `${manifest.body?.icons?.length} 个`);
  check('manifest display 为 standalone', manifest.body.display === 'standalone', manifest.body.display);
  const iconOk = await page.evaluate(async (icons) => {
    for (const i of icons) {
      const res = await fetch(i.src);
      if (!res.ok) return false;
    }
    return true;
  }, manifest.body.icons);
  check('manifest 里每个图标都能取到', iconOk);

  console.log('\n[3] Service Worker');
  const swState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return { registered: false };
    await navigator.serviceWorker.ready;
    return { registered: true, scope: reg.scope, active: !!reg.active };
  });
  check('Service Worker 注册成功', swState.registered, JSON.stringify(swState));
  check('Service Worker 已激活', swState.active === true, JSON.stringify(swState));
  const cacheNames = await page.evaluate(() => caches.keys());
  check('已建立缓存', cacheNames.length > 0, cacheNames.join(', '));

  console.log('\n[4] 交互');
  await page.locator('.case').first().click();
  await page.waitForSelector('.p-name', { timeout: 20000 });
  check('点击示例可进报告页', page.url().includes('#/r/'), page.url());

  console.log('\n[5] 控制台');
  const real = errors.filter((e) => !/favicon|Failed to load resource/i.test(e));
  check('无 JS 运行时错误', real.length === 0, real.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n桌面包冒烟: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
