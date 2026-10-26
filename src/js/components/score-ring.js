/**
 * Code ICU · 健康分区块
 *
 * 【命名说明】交付清单里这个文件叫 score-ring.js，但设计稿（mockup-report.html §2）
 * 用的是「等宽大数字 + 五段分诊标尺」，没有环形进度条。环形在移动端会把 87 这个
 * 唯一的读数压成一个小圈里的小字，而这份报告最需要的就是一眼看见分数。
 * 这里按稿子实现，文件名保留以对齐清单，导出函数叫 renderScore。
 *
 * 五段标尺的宽度直接从 config.LEVELS 的区间算，改分级只需要改 LEVELS。
 * @module components/score-ring
 */

import { LEVELS, LEVEL_EN, REMAINING_MIN_AGE_DAYS } from '../config.js';
import { REMAINING_FORMULA, scoreNarrative } from '../copy.js';
import { esc, num } from '../dom.js';

/**
 * 五段标尺：低分在左、高分在右，宽度按各自区间长度分配。
 * @returns {Array<{min: number, max: number, label: string, tone: string, width: number}>}
 */
function triageBands() {
  const ascending = [...LEVELS].sort((a, b) => a.min - b.min);
  return ascending.map((item, i) => {
    const upper = ascending[i + 1]?.min ?? 101;
    return { min: item.min, max: upper - 1, label: item.label, tone: item.tone, width: upper - item.min };
  });
}

/** @param {number|null} health @param {number} min @param {number} max */
const inBand = (health, min, max) => typeof health === 'number' && health >= min && health <= max;

/**
 * 渲染健康分区块。
 * @param {object} result analyze() 或 loadSnapshot() 的返回值
 * @returns {string} HTML
 */
export function renderScore(result) {
  const { health, level, remainingDays, degraded, failed, insufficient, ageDays } = result;
  const bands = triageBands();
  const hasScore = typeof health === 'number' && Number.isFinite(health);

  const segs = bands
    .map((band) => `<span class="seg s-${band.tone}${inBand(health, band.min, band.max) ? ' on' : ''}" style="flex:${band.width}"></span>`)
    .join('');
  const labels = bands
    .map(
      (band) => `<div style="flex:${band.width}">
            <div class="rl${inBand(health, band.min, band.max) ? ' on' : ''}">${esc(band.label)}</div>
            <div class="rl-range">${band.min}–${band.max}</div>
          </div>`,
    )
    .join('');

  // 「取数失败」和「样本不足」必须分开说（SPEC §6.0）。
  // 前者该引导用户点「重试」；后者重试一万次也一样，说了反而让用户白等。
  const failedKeys = failed ?? degraded ?? [];
  const insufficientKeys = insufficient ?? [];
  const degradedNote = failedKeys.length
    ? `<p class="pg-note">${failedKeys.length} 项数据取数失败已弃权，剩余权重重新归一化后计算。</p>`
    : '';
  const insufficientNote = insufficientKeys.length
    ? `<p class="pg-note">${insufficientKeys.length} 项因建仓时间太短、样本不足而弃权，剩余权重重新归一化后计算——这不是缺数，重试也不会变。</p>`
    : '';

  // 寿命推演为 null 时不能只留一个破折号：读者不知道是「算不出来」还是「不给算」。
  const tooYoung = hasScore && Number.isFinite(ageDays) && ageDays < REMAINING_MIN_AGE_DAYS;
  const noPrognosis = hasScore
    ? tooYoung
      ? '建仓不足 30 天，样本太短，暂不推演。'
      : '这次没读到停更天数，推不出剩余寿命。'
    : '健康分本身算不出来，先修好取数再谈推演。';
  const prognosisNote =
    remainingDays === null ? `<p class="pg-note">${noPrognosis}</p>` : '';

  return `<section class="sheet">
      <div class="sheet-head">
        <span class="label">综合健康分 / HEALTH SCORE</span>
        <span class="num">六项加权</span>
      </div>
      <div class="score-sheet">
        <div class="score-main" role="group" aria-label="综合健康分 ${hasScore ? health : '无法计算'} 分，满分 100 分，病危等级：${esc(level.label)}">
          <div class="score-num-wrap">
            <span class="score-num num">${hasScore ? health : '—'}</span>
            <span class="score-den num">/100</span>
          </div>
          <div class="score-right">
            <span class="chip chip-lg c-${level.tone}">${esc(level.label)} · ${LEVEL_EN[level.level] ?? 'N/A'}</span>
            <p class="score-diag">${esc(scoreNarrative(result))}</p>
          </div>
        </div>

        <div class="ruler">
          <div class="ruler-top">
            <span class="label">分诊标尺 / TRIAGE</span>
            <span class="num" style="font-size:var(--text-2xs);color:var(--meta)">SCORE ${hasScore ? health : '—'}</span>
          </div>
          <div class="ruler-track" aria-hidden="true">${segs}</div>
          <div class="ruler-labels" aria-hidden="true">${labels}</div>
        </div>

        <div class="prognosis">
          <span class="label">预后推演 / PROGNOSIS</span>
          <span class="pg-num num">${remainingDays === null ? '—' : num(remainingDays)}</span>
          <span class="pg-unit">${remainingDays === null ? '无法推演' : '天'}</span>
          <p class="pg-note">${esc(REMAINING_FORMULA)}</p>
          ${prognosisNote}
          ${degradedNote}
          ${insufficientNote}
        </div>
      </div>
    </section>`;
}
