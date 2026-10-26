/**
 * Code ICU · 监护屏外框
 *
 * 只负责外壳：标题行、画布容器、LIVE 角标、图注。波形本身在 ecg-screen.js。
 * 全年零提交时不显示 LIVE 呼吸点，改成 ASYSTOLE（等电位线）标记 ——
 * 一个心脏已经不跳的病人，屏幕上不该还有东西在闪。
 * @module components/monitor
 */

import { monthTicks } from './ecg.js';
import { num } from '../dom.js';

/**
 * @param {object} result analyze() 或 loadSnapshot() 的返回值
 * @returns {string} HTML
 */
export function monitorFigure(result) {
  const breathing = result.vitals.find((item) => item.key === 'breathing')?.detail ?? {};
  const monthly = breathing.monthly ?? new Array(12).fill(0);
  const total = breathing.total ?? 0;
  const ticks = monthTicks(result.fetchedAt ?? Date.now());
  const span = `${ticks[0]?.ym ?? ''} → ${ticks[11]?.ym ?? ''}`;

  let peak = { value: -1, index: 0 };
  let valley = { value: Infinity, index: 0 };
  monthly.forEach((value, index) => {
    if (value > peak.value) peak = { value, index };
    if (value < valley.value) valley = { value, index };
  });
  const ratio = valley.value > 0 ? (peak.value / valley.value).toFixed(1) : null;

  const caption =
    total === 0
      ? `<span>全年 <b>0 次提交</b>，波形是一条平直线</span><span>${span}</span>`
      : `<span>峰值 <b>${ticks[peak.index]?.ym} · ${num(peak.value)} 次</b></span>
         <span>谷值 <b>${ticks[valley.index]?.ym} · ${num(valley.value)} 次</b></span>
         <span>波动比 <b>${ratio ? `${ratio}×` : '—'}</b></span>
         <span>${span}</span>`;

  return `<figure class="monitor">
      <div class="mon-hd">
        <span class="label">近 12 个月提交 / COMMIT RHYTHM</span>
        <span class="mon-read"><span class="num">${num(total)}</span><em>${breathing.capped ? '次以上 / 年' : '次 / 年'}</em></span>
      </div>
      <div class="screen">
        <canvas role="img"></canvas>
        ${
          total === 0
            ? '<div class="mon-flat">ASYSTOLE · 等电位线</div>'
            : '<div class="mon-live"><i aria-hidden="true"></i>LIVE</div>'
        }
      </div>
      <figcaption class="mon-cap">${caption}</figcaption>
    </figure>`;
}
