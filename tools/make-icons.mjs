/**
 * 生成 PWA / 桌面安装所需的 PNG 图标。
 *
 * 用 Playwright 把内联 SVG 渲染成 PNG —— 不引入 sharp / imagemagick 这类
 * 二进制依赖，避免为一个图标给项目添上原生依赖。
 *
 * 图标语义：深色监护屏底（--p-monitor-900）+ 红色急诊十字（--p-alarm-600）
 * + 绿色心电波形（--p-monitor-trace）。
 *
 * 用法：node tools/make-icons.mjs
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/icons');

const MONITOR = '#0E1613';
const ALARM = '#C1272D';
const TRACE = '#3BF08C';
const PAPER = '#FAFAF7';

/**
 * 生成一张图标的 SVG 源码。
 * @param {number} size 画布边长
 * @param {{maskable?: boolean, opaque?: boolean}} opts maskable 需要铺满全画布；
 *        opaque 用于 apple-touch-icon（Apple 不支持透明角）
 */
function svg(size, { maskable = false, opaque = false } = {}) {
  const radius = maskable ? 0 : Math.round(size * 0.22);
  const bg = maskable || opaque ? MONITOR : MONITOR;
  // maskable 的内容要缩进到中心 80% 的安全区内，否则被系统裁圆时会被切掉
  const scale = maskable ? 0.68 : 0.84;
  const s = size * scale;
  const offset = (size - s) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>
  <g transform="translate(${offset} ${offset}) scale(${s / 512})">
    <g transform="translate(256 208)">
      <rect x="-108" y="-108" width="216" height="216" rx="46" fill="${ALARM}"/>
      <path d="M-24 -74 h48 v50 h50 v48 h-50 v50 h-48 v-50 h-50 v-48 h50 z" fill="${PAPER}"/>
    </g>
    <path d="M56 392 L140 392 L176 322 L220 462 L264 344 L296 392 L456 392"
          fill="none" stroke="${TRACE}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, opts: {} },
  { file: 'icon-512.png', size: 512, opts: {} },
  { file: 'icon-maskable-512.png', size: 512, opts: { maskable: true } },
  { file: 'apple-touch-icon.png', size: 180, opts: { opaque: true } },
  { file: 'favicon-32.png', size: 32, opts: {} },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

for (const t of TARGETS) {
  const markup = svg(t.size, t.opts);
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<!doctype html><meta charset="utf-8">
     <style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>
     ${markup}`,
    { waitUntil: 'load' },
  );
  const path = join(OUT, t.file);
  await page.screenshot({ path, omitBackground: !t.opts.maskable && !t.opts.opaque });
  console.log(`  ✓ ${t.file}  ${t.size}×${t.size}`);
}

await browser.close();
console.log(`图标已生成到 ${OUT}`);
