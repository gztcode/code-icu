/**
 * Code ICU · 视图层真跑验收
 *
 * 不是"描述自测"，是真的开浏览器、真的截图、真的断言。
 * 异常态用 Playwright 的 route 拦截伪造 GitHub 响应，不消耗真限流额度，也不会因为
 * 本机 IP 额度用尽而假失败。
 *
 * 用法：
 *   node tests/serve.mjs 8081                  # 另开一个终端，零依赖静态服务
 *   node tests/ui-check.mjs
 *
 * 注意：`python3 -m http.server` 的监听队列长度是 5，而本页一进来就要并行拉 17 个 ES Module，
 * 队列溢出时会有模块被 RST 掉（net::ERR_CONNECTION_RESET），表现为随机白屏。
 * 那是服务器的锅不是页面的锅，所以这里的断言统一跑在 tests/serve.mjs 上。
 */

import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { DEMO_REPOS } from '../src/js/config.js';
import { vitalCard } from '../src/js/components/vital-card.js';
import { renderScore } from '../src/js/components/score-ring.js';

const BASE = 'http://127.0.0.1:8081/';
const OUT = 'tests/shots';
const GH = '**/api.github.com/**';

let pass = 0;
let fail = 0;

/**
 * @param {string} name
 * @param {boolean} cond
 * @param {string} [extra]
 */
function check(name, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}${extra ? `  (${extra})` : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${extra ? `  (${extra})` : ''}`);
  }
}

/**
 * 开一个上下文。console error 只收 JS 异常与脚本错误，资源加载失败（字体）不算。
 * @param {import('playwright').Browser} browser
 * @param {{width: number, height: number}} size
 */
async function open(browser, size) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2 });
  const page = await context.newPage();
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !/Failed to load resource|net::ERR/.test(text)) errors.push(text);
  });
  return { context, page, errors };
}

/** 横向溢出量（<=0 表示没有横向滚动条） */
const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/**
 * 所有可点元素里最小的那个高度
 *
 * 可见性判定必须用 checkVisibility()，不能用 getComputedStyle().visibility：
 * 收起的 <details> 内容在 Chrome 里是 content-visibility: hidden —— 有布局盒子、
 * visibility 也还是 visible，但画不出来也点不到（实测 elementFromPoint 命中的是
 * 下层表单而不是里面的链接）。把它算进可点尺寸，会得出「首页有 14px 的可点元素」
 * 这种根本点不着的假缺陷。
 */
const minTouch = (page) =>
  page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, a[href], summary, input')];
    const sizes = nodes
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return false;
        if (typeof node.checkVisibility === 'function') {
          return node.checkVisibility({
            contentVisibilityAuto: true,
            opacityProperty: true,
            visibilityProperty: true,
          });
        }
        return getComputedStyle(node).visibility !== 'hidden';
      })
      .map((node) => Math.round(node.getBoundingClientRect().height));
    return sizes.length ? Math.min(...sizes) : 0;
  });

/**
 * 顶栏右侧两个操作按钮必须并排一行，不能叠成竖列。
 *
 * 踩过的坑：右侧槽位原本复用 .chart-no（flex-direction: column），那是首页
 * 「表单 / 入院登记」两行标签用的竖排布局。按钮塞进去就自动竖排了 ——
 * 视觉上「回首页」在「返回报告」上面，而两者语义上是并列的导航动作。
 * 现在按钮组走独立的 .top-actions（flex-direction: row）。
 */
const topbarLayout = (page) =>
  page.evaluate(() => {
    const slot = document.querySelector('.topbar .top-actions');
    if (!slot) return null;
    const buttons = [...slot.querySelectorAll('.top-action')].map((n) => {
      const r = n.getBoundingClientRect();
      return { text: (n.textContent ?? '').trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const identity = document.querySelector('.brand-sub-identity');
    const meta = document.querySelector('.brand-sub-meta');
    return {
      direction: getComputedStyle(slot).flexDirection,
      buttons,
      // 身份（「体检报告」/「病危通知书」）永远完整，编号可以省略
      identityClipped: identity ? identity.scrollWidth > identity.clientWidth + 1 : false,
      identityText: identity ? (identity.textContent ?? '').trim() : '',
      metaText: meta ? (meta.textContent ?? '').trim() : '',
    };
  });

/**
 * 患者档案卡的三个 GitHub 链接：头像、用户名 → owner 主页；项目名 → 仓库页。
 *
 * 曾经的坑：这三个元素全是纯文本，用户看完体检报告想去看原仓库时无处可去。
 * 现在它们都是 `<a target="_blank" rel="noopener noreferrer">`，URL 一律过
 * safeUrl() 校验（只放行 github.com 的 https 地址）。
 */
const patientLinks = (page) =>
  page.evaluate(() => {
    const pick = (sel) => {
      const n = document.querySelector(sel);
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return {
        tag: n.tagName.toLowerCase(),
        href: n.getAttribute('href'),
        target: n.getAttribute('target'),
        rel: n.getAttribute('rel'),
        text: (n.textContent ?? '').trim(),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    };
    const img = document.querySelector('.avatar img');
    return {
      avatar: pick('.avatar'),
      owner: pick('.p-owner'),
      name: pick('.p-name'),
      avatarImg: img ? { src: img.getAttribute('src'), alt: img.getAttribute('alt') } : null,
    };
  });

/**
 * 波形在纵向铺开了多少行 —— 平直线只占两三行，正常心电图能铺满大半屏。
 * 只认监护绿（#3BF08C）的像素，网格、刻度、NOW 都不算。
 */
const traceRows = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('.screen canvas');
    if (!canvas) return -1;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    const rows = new Set();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        if (data[i + 1] > 170 && data[i] < 130 && data[i + 2] < 190) {
          rows.add(y);
          break;
        }
      }
    }
    return rows.size;
  });

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  /* ---------------- 1. 首页 ---------------- */
  console.log('\n[1] 首页');
  for (const [label, size] of [
    ['375', { width: 375, height: 812 }],
    ['1200', { width: 1200, height: 900 }],
  ]) {
    const { context, page, errors } = await open(browser, size);
    await page.goto(`${BASE}#/`, { waitUntil: 'load' });
    await page.waitForSelector('.hero h1');
    await page.screenshot({ path: `${OUT}/home-${label}.png`, fullPage: true });
    check(`首页 ${label} 无横向滚动`, (await overflow(page)) <= 0, `溢出 ${await overflow(page)}px`);
    check(`首页 ${label} 无 JS 报错`, errors.length === 0, errors.join(' | '));
    if (label === '375') {
      const touch = await minTouch(page);
      check('首页 375 最小可点高度 ≥44', touch >= 44, `${touch}px`);
      const cases = await page.$$eval('.case', (nodes) => nodes.length);
      check('首页三个示例病例都在', cases === 3, `${cases} 个`);
    }

    /* Token 入口：得是能点、能跳 GitHub 设置页、且不会误折叠面板的独立链接 */
    {
      const tokenLink = await page.$('.token-link');
      check(`${label} Token 入口是链接`, tokenLink !== null);
      if (tokenLink) {
        const href = await tokenLink.getAttribute('href');
        const target = await tokenLink.getAttribute('target');
        const rel = await tokenLink.getAttribute('rel');
        check(`${label} Token 入口指向 GitHub 设置页`, href === 'https://github.com/settings/tokens', href ?? '无');
        check(`${label} Token 入口新标签打开且带 noopener`, target === '_blank' && /noopener/.test(rel ?? ''), `${target} / ${rel}`);
        const box = await tokenLink.boundingBox();
        check(`${label} Token 入口自身可点高度 ≥44`, (box?.height ?? 0) >= 44, `${Math.round(box?.height ?? 0)}px`);
      }
      // 点链接不该顺带把 details 展开/收起（stopPropagation）
      const openBefore = await page.$eval('#token-box', (n) => n.open);
      await page.click('.token-link', { modifiers: ['Control'] }).catch(() => {});
      const openAfter = await page.$eval('#token-box', (n) => n.open);
      check(`${label} 点 Token 入口不误折叠面板`, openBefore === openAfter, `${openBefore} → ${openAfter}`);
    }
    await context.close();
  }

  /* ---------------- 2. 示例按钮：零请求出结果 ---------------- */
  console.log('\n[2] 示例按钮零请求');
  {
    const { context, page } = await open(browser, { width: 375, height: 812 });
    let apiCalls = 0;
    page.on('request', (request) => {
      if (request.url().includes('api.github.com')) apiCalls += 1;
    });
    await page.goto(`${BASE}#/`, { waitUntil: 'load' });
    await page.waitForSelector('.case');
    const started = Date.now();
    await page.click('.case');
    await page.waitForSelector('.score-num');
    const elapsed = Date.now() - started;
    const score = (await page.textContent('.score-num'))?.trim();
    check('点示例立刻出报告（<1s）', elapsed < 1000, `${elapsed}ms`);
    check('express 显示 87', score === '87', `实际 ${score}`);
    check('示例报告零请求', apiCalls === 0, `实际 ${apiCalls} 次`);
    await context.close();
  }

  /* ---------------- 3. 输入台校验 ---------------- */
  console.log('\n[3] 输入台校验');
  {
    const { context, page } = await open(browser, { width: 375, height: 812 });
    let apiCalls = 0;
    page.on('request', (request) => {
      if (request.url().includes('api.github.com')) apiCalls += 1;
    });
    await page.goto(`${BASE}#/`, { waitUntil: 'load' });
    await page.fill('#repo', '这不是一个仓库地址');
    await page.press('#repo', 'Enter');
    await page.waitForSelector('.field-error.on', { timeout: 2000 });
    const msg = await page.textContent('.field-error');
    check('非法输入就地报错', Boolean(msg && msg.includes('owner/repo')), msg ?? '');
    check('非法输入不发请求', apiCalls === 0, `实际 ${apiCalls} 次`);
    check('非法输入仍停在首页', (await page.$('.hero h1')) !== null);
    await context.close();
  }

  /* ---------------- 4. 报告页：健康对照 & 临床死亡 ---------------- */
  console.log('\n[4] 报告页');
  const reportCases = [
    { slug: 'expressjs/express', score: '87', level: '健康', flat: false },
    { slug: 'request/request', score: '16', level: '临床死亡', flat: true },
  ];
  for (const item of reportCases) {
    for (const [label, size] of [
      ['375', { width: 375, height: 812 }],
      ['1200', { width: 1200, height: 900 }],
    ]) {
      const { context, page, errors } = await open(browser, size);
      await page.goto(`${BASE}#/r/${item.slug}`, { waitUntil: 'load' });
      await page.waitForSelector('.score-num');
      await page.waitForTimeout(350); // 等一帧 Canvas
      await page.screenshot({ path: `${OUT}/report-${item.slug.split('/')[1]}-${label}.png`, fullPage: true });

      const score = (await page.textContent('.score-num'))?.trim();
      const chip = (await page.textContent('.score-right .chip'))?.trim() ?? '';
      const banner = (await page.textContent('.snapbar'))?.trim() ?? '';
      check(`${item.slug} ${label} 分数 ${item.score}`, score === item.score, `实际 ${score}`);
      check(`${item.slug} ${label} 等级 ${item.level}`, chip.includes(item.level), chip);
      check(`${item.slug} ${label} 标注示例数据`, banner.includes('示例数据') && banner.includes('采集于'), banner.slice(0, 40));
      check(`${item.slug} ${label} 无横向滚动`, (await overflow(page)) <= 0, `溢出 ${await overflow(page)}px`);
      check(`${item.slug} ${label} 无 JS 报错`, errors.length === 0, errors.join(' | '));

      /* 患者档案卡的三个 GitHub 链接：头像 / 用户名 → owner 主页，项目名 → 仓库页 */
      {
        const [owner, repoName] = item.slug.split('/');
        const pl = await patientLinks(page);
        const expectOwnerUrl = `https://github.com/${owner}`;
        const expectRepoUrl = `https://github.com/${owner}/${repoName}`;

        check(`${item.slug} ${label} 头像是链接`, pl.avatar?.tag === 'a', pl.avatar?.tag ?? '缺失');
        check(`${item.slug} ${label} 头像指向 owner 主页`, pl.avatar?.href === expectOwnerUrl, pl.avatar?.href ?? '无 href');
        check(`${item.slug} ${label} 用户名是链接`, pl.owner?.tag === 'a', pl.owner?.tag ?? '缺失');
        check(`${item.slug} ${label} 用户名指向 owner 主页`, pl.owner?.href === expectOwnerUrl, pl.owner?.href ?? '无 href');
        check(`${item.slug} ${label} 项目名是链接`, pl.name?.tag === 'a', pl.name?.tag ?? '缺失');
        check(`${item.slug} ${label} 项目名指向仓库页`, pl.name?.href === expectRepoUrl, pl.name?.href ?? '无 href');

        // 外链必须新窗口打开且切断 opener（否则目标页能反向操纵本页）
        for (const [what, node] of [['头像', pl.avatar], ['用户名', pl.owner], ['项目名', pl.name]]) {
          check(`${item.slug} ${label} ${what}新窗口打开`, node?.target === '_blank', node?.target ?? '无 target');
          check(
            `${item.slug} ${label} ${what}有 noopener noreferrer`,
            (node?.rel ?? '').includes('noopener') && (node?.rel ?? '').includes('noreferrer'),
            node?.rel ?? '无 rel',
          );
        }

        // 头像图：来自 avatars.githubusercontent.com，加载失败时回落成首字母色块
        check(`${item.slug} ${label} 头像图地址合法`, (pl.avatarImg?.src ?? '').startsWith('https://avatars.githubusercontent.com/'), pl.avatarImg?.src ?? '无 img');
        check(`${item.slug} ${label} 头像是装饰性的（alt 空）`, pl.avatarImg?.alt === '', pl.avatarImg?.alt ?? '无 alt');

        // 首字母色块必须还在 DOM 里 —— 头像图加载失败时靠它兜底
        const hasInitials = await page.$eval('.avatar', (n) => {
          const span = n.querySelector('span');
          return Boolean(span && (span.textContent ?? '').trim().length > 0);
        });
        check(`${item.slug} ${label} 首字母兜底块还在`, hasInitials);
      }

      /* 回首页的入口：报告页是二级页，必须能走回首页 */
      {
        const homeLink = await page.$('a.top-action[href="#/"]');
        check(`${item.slug} ${label} 顶栏有「回首页」链接`, homeLink !== null);
        const brandHref = await page.$eval('.brand', (n) => n.getAttribute('href'));
        check(`${item.slug} ${label} 品牌是回首页的链接`, brandHref === '#/', brandHref ?? '不是链接');
        const homeText = homeLink ? ((await homeLink.textContent())?.trim() ?? '') : '';
        check(`${item.slug} ${label} 「回首页」文案正确`, homeText.includes('回首页'), homeText);

        /* 顶栏两个按钮并排一行（曾经因为复用了竖排的 .chart-no 而叠成上下两个） */
        const tb = await topbarLayout(page);
        check(`${item.slug} ${label} 顶栏按钮槽是横排`, tb?.direction === 'row', tb?.direction ?? '没有 .top-actions');
        check(
          `${item.slug} ${label} 顶栏两个按钮同一行`,
          tb?.buttons.length === 2 && Math.abs(tb.buttons[0].y - tb.buttons[1].y) < 2,
          tb?.buttons.map((b) => `${b.text}@y${b.y}`).join(' | ') ?? '',
        );
        check(`${item.slug} ${label} 顶栏页面身份没被挤掉`, tb?.identityClipped === false, tb?.identityText ?? '');
        check(`${item.slug} ${label} 顶栏编号在主体区另有完整版`, (tb?.metaText ?? '').length > 0, tb?.metaText ?? '无编号');

        // 真点一下，确认能回到首页而不是点了没反应
        await homeLink?.click();
        await page.waitForTimeout(250);
        check(`${item.slug} ${label} 点「回首页」真的回到首页`, page.url().endsWith('#/'), page.url());
        await page.goBack();
        await page.waitForSelector('.score-num');
      }

      const rows = await traceRows(page);
      if (item.flat) {
        // 平直线只有描边那几行（含抗锯齿边缘）；正常心电图在同样尺寸下是三位数
        check(`${item.slug} ${label} 波形是平直线`, rows >= 0 && rows <= 20, `${rows} 行`);
        check(`${item.slug} ${label} 显示 ASYSTOLE`, (await page.$('.mon-flat')) !== null);
      } else {
        check(`${item.slug} ${label} 波形有心搏`, rows >= 40, `${rows} 行`);
      }
      if (label === '375') {
        const touch = await minTouch(page);
        check(`${item.slug} 375 最小可点高度 ≥44`, touch >= 44, `${touch}px`);
        const vitals = await page.$$eval('.vital', (nodes) => nodes.length);
        check(`${item.slug} 六项体征都在`, vitals === 6, `${vitals} 项`);
      }
      await context.close();
    }
  }

  /* ---------------- 5. 体检中（loading） ---------------- */
  console.log('\n[5] 体检中');
  {
    const { context, page, errors } = await open(browser, { width: 375, height: 812 });
    await page.route(GH, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 20000));
      await route.abort('failed');
    });
    await page.goto(`${BASE}#/r/acme/never-returns`, { waitUntil: 'load' });
    await page.waitForSelector('.steps');
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${OUT}/loading-375.png`, fullPage: true });
    const steps = await page.$$eval('.step', (nodes) => nodes.length);
    const timer = (await page.textContent('#timer'))?.trim() ?? '';
    const barText = (await page.textContent('#bar-text'))?.trim() ?? '';
    check('loading 渲染 5 个真实端点', steps === 5, `${steps} 行`);
    check('秒表在走', /^\d{2}:\d{2}\.\d$/.test(timer), timer);
    check('进度条未完成', barText.includes('已完成 0 / 5'), barText);
    check('loading 无横向滚动', (await overflow(page)) <= 0);
    check('loading 无 JS 报错', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  /* ---------------- 6. 三种异常态 ---------------- */
  console.log('\n[6] 异常态');
  const faults = [
    {
      name: '404',
      title: '查无此院',
      route: (route) =>
        route.fulfill({
          status: 404,
          headers: { 'access-control-allow-origin': '*' },
          contentType: 'application/json',
          body: '{"message":"Not Found"}',
        }),
      expect: (page) => page.textContent('.err h2'),
    },
    {
      name: 'rate',
      title: 'GitHub 把门关了',
      route: (route) =>
        route.fulfill({
          status: 403,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-expose-headers': 'x-ratelimit-remaining,x-ratelimit-reset',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 900),
          },
          contentType: 'application/json',
          body: '{"message":"API rate limit exceeded"}',
        }),
      expect: (page) => page.textContent('.err h2'),
    },
    {
      name: 'network',
      title: '请求没有发出去',
      route: (route) => route.abort('failed'),
      expect: (page) => page.textContent('.err h2'),
    },
  ];

  for (const fault of faults) {
    const { context, page, errors } = await open(browser, { width: 375, height: 812 });
    await page.route(GH, fault.route);
    await page.goto(`${BASE}#/r/acme/broken-${fault.name}`, { waitUntil: 'load' });
    await page.waitForSelector('.err', { timeout: 20000 });
    await page.screenshot({ path: `${OUT}/error-${fault.name}-375.png`, fullPage: true });
    const title = (await fault.expect(page))?.trim() ?? '';
    const tech = (await page.textContent('.tech'))?.trim() ?? '';
    const actions = await page.$$eval('.err-act .btn', (nodes) => nodes.length);
    check(`异常态 ${fault.name} 标题正确`, title === fault.title, title);
    check(`异常态 ${fault.name} 有技术信息`, tech.length > 10, tech.slice(0, 50).replace(/\n/g, ' '));
    check(`异常态 ${fault.name} 给了下一步`, actions >= 2, `${actions} 个动作`);
    check(`异常态 ${fault.name} 无横向滚动`, (await overflow(page)) <= 0);
    check(`异常态 ${fault.name} 无 JS 报错`, errors.length === 0, errors.join(' | '));

    if (fault.name === 'rate') {
      const countdown = (await page.textContent('#reset-left'))?.trim() ?? '';
      check('限流倒计时是活的', /^\d{2}:\d{2}:\d{2}$/.test(countdown), countdown);
    }
    await context.close();
  }

  /* ---------------- 7. 非法路由回落 ---------------- */
  console.log('\n[7] 非法路由');
  {
    const { context, page, errors } = await open(browser, { width: 375, height: 812 });
    await page.goto(`${BASE}#/r/!!!`, { waitUntil: 'load' });
    await page.waitForSelector('.hero h1', { timeout: 5000 });
    check('非法路由回落首页', (await page.$('.hero h1')) !== null);
    check('非法路由无 JS 报错', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  /* ---------------- 8. 三个示例快照与基线一致 ---------------- */
  console.log('\n[8] 快照基线');
  for (const item of DEMO_REPOS) {
    const { context, page } = await open(browser, { width: 375, height: 812 });
    await page.goto(`${BASE}#/r/${item.slug}`, { waitUntil: 'load' });
    await page.waitForSelector('.score-num');
    const score = (await page.textContent('.score-num'))?.trim();
    check(`${item.slug} 分数等于 expectHealth ${item.expectHealth}`, score === String(item.expectHealth), `实际 ${score}`);
    await context.close();
  }

  /* ---------------- 9. 弃权（score === null）渲染 ---------------- */
  console.log('\n[9] 弃权渲染（纯函数，不开浏览器）');
  {
    const broken = {
      key: 'immunity',
      label: '免疫',
      score: null,
      weight: 0.15,
      effectiveWeight: 0,
      value: null,
      unit: '%僵尸',
      diagnosis: '这项数据没取到',
      formula: '先剔除混进来的 PR…',
      detail: { score: null, open: 0, stale: 0, staleRatio: 0, backlog: 0, penalty: 0, base: 0 },
    };
    const html = vitalCard(broken);
    check('弃权项显示「数据缺失」', html.includes('数据缺失'));
    check('弃权项不显示 0 分', !html.includes('>0.0<') && !html.includes('v-num num">0<'));
    check('弃权项分数是破折号', html.includes('>—</b>'));
    check('弃权项没有任何填充的评分段', !html.includes('<i class="on"></i>'));
    check('弃权项权重显示 0%', html.includes('权重 0%'));

    const full = vitalCard({ ...broken, key: 'heartbeat', label: '心跳', score: 100, value: 2, unit: '天未提交', detail: { score: 100, days: 2, archived: false } });
    check('满分项五段评分条全亮', (full.match(/<i class="on"><\/i>/g) ?? []).length === 5);

    const noScore = renderScore({
      health: null,
      level: { level: 'unknown', label: '数据不足', tone: 'dead', summary: '关键指标全部取数失败，无法出具结论' },
      remainingDays: null,
      degraded: ['heartbeat', 'breathing'],
    });
    check('健康分算不出来时不显示 0', noScore.includes('>—</span>') && !noScore.includes('>0</span>'));
    check('健康分算不出来时标注弃权项数', noScore.includes('2 项数据取数失败已弃权'));
  }

  /* ---------------- 10. GitHub 不可达时的快照兜底 ---------------- */
  console.log('\n[10] GitHub 不可达');
  {
    const { context, page, errors } = await open(browser, { width: 375, height: 812 });
    // 只掐断 api.github.com，页面本身的静态资源照常加载 —— 这才是「GitHub 挂了」的真实场景
    await page.route(GH, (route) => route.abort('failed'));
    await page.goto(`${BASE}#/r/request/request`, { waitUntil: 'load' });
    await page.waitForSelector('.score-num', { timeout: 10000 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/offline-request-375.png`, fullPage: true });
    const score = (await page.textContent('.score-num'))?.trim();
    const banner = (await page.textContent('.snapbar'))?.trim() ?? '';
    check('GitHub 不可达仍出报告（不白屏）', score === '16', `实际 ${score}`);
    check('GitHub 不可达时标注示例数据', banner.includes('示例数据') && banner.includes('采集于'), banner.slice(0, 30));
    check('GitHub 不可达时没有错误页', (await page.$('.err')) === null);
    check('GitHub 不可达无 JS 报错', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  /* ---------------- 11. 病危通知书 + Canvas 导出 ---------------- */
  console.log('\n[11] 病危通知书');
  for (const [label, size] of [
    ['375', { width: 375, height: 812 }],
    ['1200', { width: 1200, height: 900 }],
  ]) {
    const { context, page, errors } = await open(browser, size);
    await page.goto(`${BASE}#/notice/request/request`, { waitUntil: 'load' });
    await page.waitForSelector('.poster');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/notice-request-${label}.png`, fullPage: true });
    const score = (await page.textContent('.poster .score'))?.trim();
    const chip = (await page.textContent('.poster .chip'))?.trim();
    const no = (await page.textContent('.poster .no'))?.trim();
    const concl = (await page.innerText('.poster .concl')).split('\n');
    const flat = await page.$$eval('.poster .vfill', (nodes) => nodes.map((n) => n.style.width));
    check(`通知书 ${label} 显示 16 分`, score === '16', `实际 ${score}`);
    check(`通知书 ${label} 等级 临床死亡 · DEAD`, chip === '临床死亡 · DEAD', chip ?? '');
    check(`通知书 ${label} 病案号 EX-20110123`, no === 'NO. EX-20110123', no ?? '');
    check(`通知书 ${label} 结论两行`, concl.length === 2 && concl[0].length > 10 && concl[1].length > 6, `${concl.length} 行`);
    // 0 分的项填充宽度必须是 0，不许为了好看补一段假填充
    check(`通知书 ${label} 0 分项不补假填充`, flat[0] === '0px' && flat[1] === '0px' && flat[4] === '0px', flat.join(' / '));
    check(`通知书 ${label} 无横向滚动`, (await overflow(page)) <= 0, `溢出 ${await overflow(page)}px`);
    check(`通知书 ${label} 无 JS 报错`, errors.length === 0, errors.join(' | '));

    /* 回首页的入口：通知书页也是二级页 */
    {
      const homeLink = await page.$('a.top-action[href="#/"]');
      check(`通知书 ${label} 顶栏有「回首页」链接`, homeLink !== null);
      const brandHref = await page.$eval('.brand', (n) => n.getAttribute('href'));
      check(`通知书 ${label} 品牌是回首页的链接`, brandHref === '#/', brandHref ?? '不是链接');
      const backHref = await page.$eval('[data-act="back"]', (n) => n.getAttribute('data-act')).catch(() => null);
      check(`通知书 ${label} 「返回报告」按钮仍在`, backHref === 'back', backHref ?? '没有');

      /* 顶栏两个按钮并排一行（曾经因为复用了竖排的 .chart-no 而叠成上下两个） */
      const tb = await topbarLayout(page);
      check(`通知书 ${label} 顶栏按钮槽是横排`, tb?.direction === 'row', tb?.direction ?? '没有 .top-actions');
      check(
        `通知书 ${label} 顶栏两个按钮同一行`,
        tb?.buttons.length === 2 && Math.abs(tb.buttons[0].y - tb.buttons[1].y) < 2,
        tb?.buttons.map((b) => `${b.text}@y${b.y}`).join(' | ') ?? '',
      );
      check(`通知书 ${label} 顶栏页面身份没被挤掉`, tb?.identityClipped === false, tb?.identityText ?? '');
      check(`通知书 ${label} 顶栏编号在主体区另有完整版`, (tb?.metaText ?? '').length > 0, tb?.metaText ?? '无编号');

      if (label === '375') {
        await homeLink?.click();
        await page.waitForTimeout(250);
        check(`通知书 ${label} 点「回首页」真的回到首页`, page.url().endsWith('#/'), page.url());
      }
    }
    await context.close();
  }
  {
    const { context, page, errors } = await open(browser, { width: 1200, height: 900 });
    let api = 0;
    page.on('request', (request) => {
      if (request.url().includes('api.github.com')) api += 1;
    });
    await page.goto(`${BASE}#/r/request/request`, { waitUntil: 'load' });
    await page.waitForSelector('.score-num');
    const reportScores = await page.$$eval('.vital .v-score b', (nodes) => nodes.map((n) => n.textContent.trim()));
    await page.click('[data-act="notice"]');
    await page.waitForSelector('.poster');
    check('报告页 → 通知书走内存结果，零请求', api === 0, `${api} 次`);
    check('路由落到 #/notice/request/request', page.url().endsWith('#/notice/request/request'), page.url());

    const noticeScores = await page.$$eval('.poster .vs', (nodes) => nodes.map((n) => n.textContent.trim()));
    check('六项体征数值与报告页逐位一致', reportScores.join(',') === noticeScores.join(','), `${noticeScores.join(' / ')}`);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.click('[data-act="download"]'),
    ]);
    const file = `${OUT}/notice-export.png`;
    await download.saveAs(file);
    const buf = await readFile(file);
    check(
      '导出文件名 code-icu-{owner}-{repo}-{YYYYMMDD}.png',
      /^code-icu-request-request-\d{8}\.png$/.test(download.suggestedFilename()),
      download.suggestedFilename(),
    );
    // 不看 Canvas 预览，直接读落盘的 PNG 头。字体时机的问题只在文件里现形。
    check(
      '导出的 PNG 恰好 1080×1440 像素',
      buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(16) === 1080 && buf.readUInt32BE(20) === 1440,
      `${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)} · ${Math.round(buf.length / 1024)}KB`,
    );
    check('导出过程没有跨域污染报错', !errors.some((e) => /SecurityError|tainted/i.test(e)), errors.join(' | '));
    check('导出过程无 JS 报错', errors.length === 0, errors.join(' | '));
    await context.close();
  }
  {
    // 87 分那张也要对：健康仓库的监护条是有心搏的，走的是另一条几何分支
    const { context, page, errors } = await open(browser, { width: 1200, height: 900 });
    await page.goto(`${BASE}#/notice/expressjs/express`, { waitUntil: 'load' });
    await page.waitForSelector('.poster');
    const score = (await page.textContent('.poster .score'))?.trim();
    const chip = (await page.textContent('.poster .chip'))?.trim();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.click('[data-act="download"]'),
    ]);
    await download.saveAs(`${OUT}/notice-export-express.png`);
    const buf = await readFile(`${OUT}/notice-export-express.png`);
    check('通知书 express 显示 87 分', score === '87', `实际 ${score}`);
    check('通知书 express 等级 健康 · HEALTHY', chip === '健康 · HEALTHY', chip ?? '');
    check(
      '导出 express 的 PNG 也是 1080×1440',
      buf.readUInt32BE(16) === 1080 && buf.readUInt32BE(20) === 1440,
      `${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)}`,
    );
    check('导出 express 无 JS 报错', errors.length === 0, errors.join(' | '));
    await context.close();
  }
  {
    // 没有病历的深链：不白屏、不偷偷发请求，给一条能照做的下一步
    const { context, page, errors } = await open(browser, { width: 375, height: 812 });
    let api = 0;
    page.on('request', (request) => {
      if (request.url().includes('api.github.com')) api += 1;
    });
    await page.goto(`${BASE}#/notice/acme/never-checked`, { waitUntil: 'load' });
    await page.waitForSelector('.notice-missing');
    check('无病历的深链不白屏', (await page.$('.notice-missing')) !== null);
    check('无病历的深链不发请求', api === 0, `${api} 次`);
    check('无病历时给出「先做体检」', (await page.textContent('.notice-missing')).includes('先做体检'));
    check('无病历深链无 JS 报错', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  await browser.close();
  console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
