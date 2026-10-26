/**
 * Code ICU · 印章与落款的间距回归
 *
 * 背景：印章曾经把圆心当成了外框的右边界（786），整个章右移 90px，正好压住右下角的
 * 落款文字。Canvas 导出那版后来单独修对了，DOM 预览却还在错的位置——于是出现
 * 「导出的图正常、页面上的印章压字」的分裂现象。坐标一旦改错，肉眼在缩略图上很难发现。
 *
 * 所以这里不靠"看着没问题"，改成两条硬断言：
 *   1. DOM 预览：用 SVG 自己的几何算印章墨迹的最右点，和落款正文的左缘比，
 *      换算回 1080 设计坐标后必须留出可见间隙（两个视口宽度都验，缩放后仍要成立）；
 *   2. Canvas 导出：在导出的 PNG 上扫落款那条带子，凡有印章红像素就算压字。
 *
 * 顺带把「印章弧形文字方向对不对」也锁了：上弧的文字必须整体在章心之上，下弧在之下。
 *
 * 用法（需要 8081 端口上有 tests/serve.mjs）：
 *   node tests/serve.mjs 8081 && node tests/stamp-check.mjs
 */

import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8081/';

/** 印章红：tokens.css --p-alarm-600 */
const STAMP_RGB = { r: 0xc1, g: 0x27, b: 0x2d };
/** 判定"是印章红"的容差（PNG 有抗锯齿和 0.9 透明度混色） */
const RED_TOLERANCE = 78;
/** DOM 预览里要求的最小可见间隙，按 1080 设计坐标算 */
const MIN_GAP_DESIGN = 12;

let pass = 0;
let fail = 0;

function check(name, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}${extra ? `  (${extra})` : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${extra ? `  (${extra})` : ''}`);
  }
}

/** 判断一个像素是不是印章红（红色通道显著高于绿蓝） */
function isStampRed(r, g, b) {
  const near = (v, t) => Math.abs(v - t) <= RED_TOLERANCE;
  return near(r, STAMP_RGB.r) && near(g, STAMP_RGB.g) && near(b, STAMP_RGB.b) && r > g + 40 && r > b + 40;
}

async function main() {
  const browser = await chromium.launch();

  /* ---------------- 1. DOM 预览：印章墨迹 vs 落款正文 ---------------- */
  console.log('\n[1] DOM 预览：印章不能压落款');

  // 两个宽度都验：海报是等比缩放的，屏幕上的间隙会随缩放变小，
  // 所以断言必须换算回 1080 设计坐标，否则手机端的压字查不出来。
  for (const [label, width, height] of [
    ['375', 375, 812],
    ['1200', 1200, 1400],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));

    await page.goto(`${BASE}#/notice/request/request`, { waitUntil: 'load' });
    await page.waitForSelector('.poster .stampbox');
    await page.waitForTimeout(400);

    const dom = await page.evaluate(() => {
      const stamp = document.querySelector('.poster .stampbox');
      const svg = stamp.querySelector('svg');
      const ring = svg.querySelector('.stamp-ring circle'); // 外圈
      const signValue = document.querySelector('.poster .sign .v');
      const signLabel = document.querySelector('.poster .sign .k');
      const poster = document.querySelector('.poster');

      // SVG 圆的真实墨迹半径：外圈半径 + 线宽的一半
      const ctm = ring.getScreenCTM();
      const pt = svg.createSVGPoint();
      const toScreen = (x, y) => {
        pt.x = x;
        pt.y = y;
        const p = pt.matrixTransform(ctm);
        return { x: p.x, y: p.y };
      };
      const cx = Number(ring.getAttribute('cx'));
      const cy = Number(ring.getAttribute('cy'));
      const r = Number(ring.getAttribute('r'));
      const stroke = Number(ring.getAttribute('stroke-width') || 0);
      const inkRadius = r + stroke / 2;

      // 圆上取四个基点，变换到屏幕坐标，取最右 —— 旋转后的真实最右点
      const cardinal = [
        toScreen(cx + inkRadius, cy),
        toScreen(cx - inkRadius, cy),
        toScreen(cx, cy + inkRadius),
        toScreen(cx, cy - inkRadius),
      ];
      const rightMost = Math.max(...cardinal.map((p) => p.x));
      const center = toScreen(cx, cy);

      const topText = svg.querySelector('.stamp-top');
      const botText = svg.querySelector('.stamp-bot');
      const tr = topText.getBoundingClientRect();
      const br = botText.getBoundingClientRect();

      const rect = (n) => {
        const r2 = n.getBoundingClientRect();
        return { x: r2.x, y: r2.y, w: r2.width, h: r2.height, right: r2.right, bottom: r2.bottom, top: r2.top };
      };

      return {
        rightMost,
        centerX: center.x,
        centerY: center.y,
        scale: poster.getBoundingClientRect().width / 1080,
        signValue: rect(signValue),
        signLabel: rect(signLabel),
        topText: rect(topText),
        botText: rect(botText),
        stampBox: rect(stamp),
      };
    });

    const gapPx = dom.signValue.x - dom.rightMost;
    const gapDesign = gapPx / dom.scale;
    check(
      `${label} 印章墨迹右缘不压落款正文`,
      gapDesign >= MIN_GAP_DESIGN,
      `间隙 ${gapDesign.toFixed(1)} 设计px（屏幕 ${gapPx.toFixed(1)}px · 缩放 ${dom.scale.toFixed(3)}）`,
    );
    check(
      `${label} 印章墨迹右缘不压落款标签`,
      (dom.signLabel.x - dom.rightMost) / dom.scale >= MIN_GAP_DESIGN,
      `间隙 ${((dom.signLabel.x - dom.rightMost) / dom.scale).toFixed(1)} 设计px`,
    );
    check(
      `${label} 印章与落款不相交`,
      dom.rightMost <= dom.signValue.x,
      `${dom.rightMost.toFixed(1)} ≤ ${dom.signValue.x.toFixed(1)}`,
    );

    // 弧形文字方向：上弧在章心之上，下弧在之下
    check(`${label} 上弧文字在章心上方`, dom.topText.bottom <= dom.centerY, `下缘 ${dom.topText.bottom.toFixed(1)} / 章心 ${dom.centerY.toFixed(1)}`);
    check(`${label} 下弧文字在章心下方`, dom.botText.top >= dom.centerY, `上缘 ${dom.botText.top.toFixed(1)} / 章心 ${dom.centerY.toFixed(1)}`);
    check(`${label} DOM 预览无 JS 报错`, errors.length === 0, errors.join(' | '));

    await context.close();
  }

  /* ---------------- 2. Canvas 导出：PNG 上扫印章红 ---------------- */
  console.log('\n[2] Canvas 导出：落款区域不许出现印章红');

  const context = await browser.newContext({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${BASE}#/notice/request/request`, { waitUntil: 'load' });
  await page.waitForSelector('.poster .stampbox');

  const png = await page.evaluate(async () => {
    // 直接复用页面里的导出逻辑，拿到真实的 1080×1440 画布
    const { renderNotice } = await import('/js/share/notice-card.js');
    const { loadSnapshot } = await import('/js/data/snapshots.js');
    const result = loadSnapshot('request/request');
    const canvas = document.createElement('canvas');
    await renderNotice(result, canvas);
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return { width: canvas.width, height: canvas.height, data: Array.from(data) };
  });

  check('导出画布是 1080×1440', png.width === 1080 && png.height === 1440, `${png.width}×${png.height}`);

  // 落款带子：设计坐标 x∈[784,1010]（1004 是右对齐基线），y∈[1100,1200]
  const redHits = [];
  for (let y = 1100; y <= 1200; y += 1) {
    for (let x = 784; x <= 1010; x += 1) {
      const i = (y * png.width + x) * 4;
      if (isStampRed(png.data[i], png.data[i + 1], png.data[i + 2])) {
        redHits.push({ x, y });
      }
    }
  }
  check(
    '落款带子里没有印章红像素',
    redHits.length === 0,
    redHits.length ? `命中 ${redHits.length} 个，例如 (${redHits[0].x},${redHits[0].y})` : '0 个',
  );

  // 印章本身必须在（不然上面那条就是"因为没画印章才没红"）
  let stampPixels = 0;
  for (let y = 1042; y <= 1222; y += 1) {
    for (let x = 606; x <= 786; x += 1) {
      const i = (y * png.width + x) * 4;
      if (isStampRed(png.data[i], png.data[i + 1], png.data[i + 2])) stampPixels += 1;
    }
  }
  check('印章本身确实画出来了', stampPixels > 500, `${stampPixels} 个红像素`);

  check('导出流程无 JS 报错', errors.length === 0, errors.join(' | '));

  /* ---------------- 3. DOM 预览 vs Canvas 导出：同一枚章 ---------------- */
  console.log('\n[3] DOM 预览与导出图必须是同一枚章');

  // 病根：SVG 的 <textPath> 把**基线**放在弧线上，字整体往外探半个字号，
  // 上弧五个字的墨迹戳到 r=81（外环内沿在 82），字骑在环线上；
  // 而 Canvas 版用 textBaseline='middle'（**字心**落在弧上），墨迹只到 r=76。
  // 于是「导出的图正常、页面上的印章不对」——两边其实画的不是同一个章。
  // 这里把两边栅格化后按**半径**比（半径不受整体旋转影响，比像素更稳）：
  // 文字带必须落在 49..76，且外环内侧 77..81 那条缝里不许有红像素。
  const radial = await page.evaluate(async () => {
    const Z = 4; // 印章 180 设计px × 4
    const svg = document.querySelector('.poster .stampbox svg');
    const color = getComputedStyle(document.documentElement).getPropertyValue('--stamp').trim();
    const isRed = (d, i) => d[i] > 120 && d[i] > d[i + 1] + 45 && d[i] > d[i + 2] + 45 && d[i + 1] < 170 && d[i + 2] < 170;

    const band = (imageData) => {
      const { data, width, height } = imageData;
      const cx = width / 2;
      const cy = height / 2;
      const hist = new Map();
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          if (!isRed(data, i)) continue;
          const k = Math.round(Math.hypot(x - cx, y - cy) / Z);
          hist.set(k, (hist.get(k) || 0) + 1);
        }
      }
      let lo = Infinity;
      let hi = -1;
      let gap = 0;
      for (const [k, v] of hist) {
        if (k > 40 && k < 82) { lo = Math.min(lo, k); hi = Math.max(hi, k); }
        if (k >= 77 && k < 82) gap += v;
      }
      return { lo, hi, gap };
    };

    /* --- DOM 侧：把 SVG 克隆出来、内联计算样式、栅格化 --- */
    const clone = svg.cloneNode(true);
    clone.querySelector('.stamp-ring').setAttribute('stroke', color);
    clone.querySelector('.stamp-star').setAttribute('fill', color);
    for (const [sel, size, weight, spacing] of [['.stamp-top', 25, 600, 6], ['.stamp-bot', 15, 500, 3]]) {
      const el = clone.querySelector(sel);
      el.setAttribute('fill', color);
      el.setAttribute('font-size', size);
      el.setAttribute('font-weight', weight);
      el.setAttribute('letter-spacing', spacing);
      el.setAttribute('font-family', '"PingFang SC","Noto Sans SC",sans-serif');
    }
    clone.setAttribute('width', '180');
    clone.setAttribute('height', '180');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // 整体旋转在 .stampbox 的 CSS transform 上，不影响半径，这里不必也不该复制进来
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    });
    const dc = document.createElement('canvas');
    dc.width = 180 * Z;
    dc.height = 180 * Z;
    dc.getContext('2d').drawImage(img, 0, 0, 180 * Z, 180 * Z);
    const dom = band(dc.getContext('2d').getImageData(0, 0, 180 * Z, 180 * Z));

    /* --- Canvas 侧：裁导出图同一块、同样放大 --- */
    const { renderNotice } = await import('/js/share/notice-card.js');
    const { loadSnapshot } = await import('/js/data/snapshots.js');
    const result = loadSnapshot('request/request');
    const full = document.createElement('canvas');
    await renderNotice(result, full);
    const cc = document.createElement('canvas');
    cc.width = 180 * Z;
    cc.height = 180 * Z;
    cc.getContext('2d').drawImage(full, 606, 1042, 180, 180, 0, 0, 180 * Z, 180 * Z);
    const canvas = band(cc.getContext('2d').getImageData(0, 0, 180 * Z, 180 * Z));

    return { dom, canvas };
  });

  check(
    'DOM 印章文字带落在 49..76（不越外环）',
    radial.dom.lo === 49 && radial.dom.hi === 76,
    `${radial.dom.lo}..${radial.dom.hi}`,
  );
  check(
    'DOM 与导出的文字半径带一致',
    radial.dom.lo === radial.canvas.lo && radial.dom.hi === radial.canvas.hi,
    `DOM ${radial.dom.lo}..${radial.dom.hi} vs 导出 ${radial.canvas.lo}..${radial.canvas.hi}`,
  );
  check(
    '文字与外环之间留有空隙（77..81 无红像素）',
    radial.dom.gap === 0,
    `${radial.dom.gap} 个红像素`,
  );
  check(
    '导出图同样留有空隙',
    radial.canvas.gap === 0,
    `${radial.canvas.gap} 个红像素`,
  );

  await browser.close();

  console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
  console.log(fail === 0 ? '结论：PASS' : '结论：FAIL');
  process.exit(fail === 0 ? 0 : 1);
}

await main();
