/**
 * Code ICU · ECG 监护屏（Canvas 渲染）
 *
 * 与 ecg.js 的分工：那边算几何，这边负责把几何画到 2D 画布上。
 * 单独一个文件是因为 Canvas 相关代码需要读计算样式、处理 devicePixelRatio 和
 * ResizeObserver，跟「纯数据 → 路径」混在一起会让两边都难测。
 *
 * 颜色一律从 CSS 变量读（`--monitor-*`），画布里不出现任何色值字面量。
 * @module components/ecg-screen
 */

import { beatOps, geometry, layoutMetrics, monthTicks } from './ecg.js';

/**
 * 读取设计 Token 的计算值。
 * @param {string} name CSS 变量名，如 `--monitor-trace`
 * @param {string} fallback
 * @returns {string}
 */
function token(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * 把 beatOps 的指令灌进当前路径。
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Array<number|string>>} ops
 * @returns {void}
 */
function strokeOps(ctx, ops) {
  for (const op of ops) {
    if (op[0] === 'q') ctx.quadraticCurveTo(op[1], op[2], op[3], op[4]);
    else ctx.lineTo(op[1], op[2]);
  }
}

/**
 * 画一帧。网格 → 波形 → 峰上读数 → 右缘 NOW 虚线 → 月份刻度，顺序不能换（后者压前者）。
 * @param {HTMLCanvasElement} canvas
 * @param {{monthly: number[], ticks: Array<{label: string, index: number}>}} options
 * @returns {{layout: object, beats: Array<object>}}
 */
function paint(canvas, { monthly, ticks }) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.round(rect.width) || 720;
  const height = Math.round(rect.height) || Math.round((width * 208) / 720);
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { layout: layoutMetrics(width, height), beats: [] };
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);

  const layout = layoutMetrics(width, height);
  const beats = geometry(monthly, layout);
  const muted = token('--monitor-muted', 'currentColor');
  const trace = token('--monitor-trace', 'currentColor');
  const alarm = token('--monitor-alarm', 'currentColor');
  const mono = token('--font-mono', 'monospace');
  const grid = token('--monitor-grid', muted);
  const grid2 = token('--monitor-grid-2', muted);

  // 网格：细网格 + 每 5 格一条粗网格，和心电图纸一样
  const minor = Math.max(4, layout.beatWidth / 2.4);
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += minor) {
    ctx.strokeStyle = grid;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += minor) {
    ctx.strokeStyle = grid;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
    ctx.stroke();
  }
  ctx.strokeStyle = grid2;
  for (let x = 0; x <= width; x += minor * 5) {
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += minor * 5) {
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
    ctx.stroke();
  }

  // 波形
  ctx.strokeStyle = trace;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(beats[0]?.x ?? layout.edge, layout.base);
  for (const beat of beats) strokeOps(ctx, beatOps(beat.x, beat.amp, layout.base, layout.beatWidth));
  ctx.stroke();

  // 峰上读数：宽度够就每拍都标，太窄就只标峰值那一拍，避免数字打架
  ctx.fillStyle = trace;
  ctx.font = `500 ${Math.max(9, Math.round(layout.beatWidth * 0.2))}px ${mono}`;
  ctx.textAlign = 'center';
  const labelAll = layout.beatWidth >= 40;
  for (const beat of beats) {
    if (!beat.value) continue;
    if (!labelAll && !beat.peak) continue;
    ctx.fillText(String(beat.value), beat.x + layout.beatWidth * 0.383, layout.base - beat.amp - 7);
  }

  // 右缘 NOW 虚线。上端留出 10px 给 NOW 读数，避免顶到右上角的 LIVE 角标
  const nowX = Math.round(layout.width - layout.edge) - 0.5;
  const nowTop = layout.base - layout.amp * 1.05;
  ctx.save();
  ctx.strokeStyle = alarm;
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(nowX, nowTop);
  ctx.lineTo(nowX, layout.base + layout.amp * 0.2);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = alarm;
  ctx.font = `500 9px ${mono}`;
  ctx.textAlign = 'right';
  ctx.fillText('NOW', nowX - 4, nowTop + 10);

  // 月份刻度
  ctx.fillStyle = muted;
  ctx.font = `500 ${Math.max(8, Math.round(layout.beatWidth * 0.16))}px ${mono}`;
  ctx.textAlign = 'center';
  for (const tick of ticks) {
    ctx.fillText(tick.label, layout.edge + layout.beatWidth * (tick.index + 0.5), height - 8);
  }
  return { layout, beats };
}

/**
 * 挂载报告页的监护屏。返回 `destroy` 供路由切换时清理 ResizeObserver。
 * @param {HTMLElement} container 挂载容器（含 `.screen` 与 `<canvas>`）
 * @param {{monthly: number[], total: number, at: string, span: string}} options
 * @returns {{destroy: () => void}}
 */
export function mountFigure(container, { monthly, total, at, span }) {
  const screen = container.querySelector('.screen');
  const canvas = container.querySelector('canvas');
  if (!screen || !canvas) return { destroy() {} };

  const ticks = monthTicks(at);
  const draw = () => paint(canvas, { monthly, ticks });
  draw();

  let frame = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  });
  observer.observe(screen);

  canvas.setAttribute(
    'aria-label',
    `近 12 个月提交趋势心电图：${span}，共 12 拍，${
      total === 0 ? '每个月都是 0 次提交，波形为一条平直的等电位线' : `合计 ${total} 次提交`
    }`,
  );
  return {
    destroy() {
      cancelAnimationFrame(frame);
      observer.disconnect();
    },
  };
}
