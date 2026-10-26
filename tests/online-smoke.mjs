/**
 * 线上冒烟测试：打真实部署地址，验证线上产物与本地一致。
 *
 * 与 ui-check.mjs 的分工：
 *   ui-check.mjs      跑本地静态服务器，验证 DOM 结构与交互
 *   online-smoke.mjs  打线上地址，验证部署链路（资源可达、路由可用、无 JS 错误）
 *
 * 用法：
 *   node tests/online-smoke.mjs [baseUrl]
 *   BASE=https://gztcode.github.io/code-icu/ node tests/online-smoke.mjs
 *
 * 依赖 Playwright（与 ui-check.mjs 同一套）：
 *   npm i playwright && npx playwright install chromium
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = (process.argv[2] || process.env.BASE || 'https://gztcode.github.io/code-icu/').replace(/\/?$/, '/');
const OUT = process.env.SHOT_DIR || '/tmp/code-icu-online-shots';
mkdirSync(OUT, { recursive: true });

/** 本机可能需要走代理，CI 与正常网络下不需要 */
const proxy = process.env.ONLINE_SMOKE_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || '';

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();

const jsErrors = [];
page.on('pageerror', (e) => jsErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') jsErrors.push(`console: ${m.text()}`);
});

/* ---------------- 1. 首页 ---------------- */
console.log(`\n[1] 首页 ${BASE}`);
await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('.hero h1', { timeout: 30000 });
check('首页主标题渲染', (await page.textContent('.hero h1')).trim().length > 0);
check('仓库输入框存在', (await page.locator('.repo-form input, input[type="text"]').count()) > 0);
const demoCount = await page.locator('.case').count();
check('内置示例按钮存在', demoCount >= 3, `找到 ${demoCount} 个`);
const brandHref = await page.getAttribute('.brand', 'href').catch(() => null);
check('品牌区可点回首页', brandHref === '#/' || brandHref === '#', `href=${brandHref}`);
await page.screenshot({ path: `${OUT}/online-home.png`, fullPage: true });

/* ---------------- 2. 报告页 ---------------- */
console.log('\n[2] 报告页');
await page.goto(`${BASE}#/r/expressjs/express`, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('.p-name', { timeout: 40000 });
await page.waitForTimeout(2000);
const repoLink = await page.getAttribute('.p-name', 'href').catch(() => null);
check('项目名链接指向 GitHub 仓库', !!repoLink && /github\.com\/.+\/.+/.test(repoLink), `href=${repoLink}`);
const ownerLink = await page.getAttribute('.p-owner', 'href').catch(() => null);
check('用户名链接指向 GitHub 用户页', !!ownerLink && /github\.com\/[^/]+/.test(ownerLink), `href=${ownerLink}`);
const avatarLink = await page.getAttribute('.avatar', 'href').catch(() => null);
check('头像链接指向 GitHub', !!avatarLink && /github\.com/.test(avatarLink), `href=${avatarLink}`);
check('报告页顶栏有「回首页」', (await page.locator('.top-actions a[href="#/"]').count()) > 0);
const score = await page.textContent('.score-num, .health-num, .score-value').catch(() => null);
check('健康分渲染', !!score && /\d/.test(score), `score=${score}`);
await page.screenshot({ path: `${OUT}/online-report.png`, fullPage: true });

/* ---------------- 3. 通知书页 ---------------- */
console.log('\n[3] 通知书页');
await page.goto(`${BASE}#/notice/expressjs/express`, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('.stamp, [class*="stamp"]', { timeout: 40000 });
await page.waitForTimeout(1200);
check('印章元素渲染', (await page.locator('.stamp, [class*="stamp"]').count()) > 0);
check('通知书页有「返回报告」按钮', (await page.locator('button[data-act="back"]').count()) > 0);
check('通知书页顶栏有「回首页」', (await page.locator('.top-actions a[href="#/"]').count()) > 0);
await page.screenshot({ path: `${OUT}/online-notice.png`, fullPage: true });

/* ---------------- 4. PNG 导出 ---------------- */
console.log('\n[4] PNG 导出');
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 60000 }),
  page.locator('[data-act="download"]').first().click(),
]);
const dlPath = `${OUT}/${download.suggestedFilename()}`;
await download.saveAs(dlPath);
check('导出 PNG 落盘', !!dlPath, download.suggestedFilename());

/* ---------------- 5. 交互连通性 ---------------- */
console.log('\n[5] 交互连通性');
await page.goto(`${BASE}#/`, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('.case', { timeout: 30000 });
await page.locator('.case').first().click();
await page.waitForSelector('.p-name', { timeout: 40000 });
check('点击示例可进入报告页', page.url().includes('#/r/'), page.url());

await page.goto(`${BASE}#/notice/expressjs/express`, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('button[data-act="back"]', { timeout: 40000 });
await page.locator('button[data-act="back"]').first().click();
await page.waitForTimeout(1000);
check('「返回报告」可回到报告页', page.url().includes('#/r/'), page.url());

await page.goto(`${BASE}#/notice/expressjs/express`, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('.top-actions a[href="#/"]', { timeout: 40000 });
await page.locator('.top-actions a[href="#/"]').first().click();
await page.waitForTimeout(1000);
check('「回首页」可回到首页', page.url().endsWith('#/') || page.url().endsWith('/'), page.url());

/* ---------------- 6. 控制台 ---------------- */
console.log('\n[6] 控制台');
const realErrors = jsErrors.filter(
  (e) => !/favicon|ERR_(?:INTERNET|NAME|CONNECTION)|Failed to load resource/i.test(e),
);
check('无 JS 运行时错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n线上冒烟: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
