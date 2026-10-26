/**
 * Code ICU · 单项体征
 *
 * 六项体征排在一张表里的六行（`divide-y` 式虚线分隔），不是六张并列卡片 ——
 * 六张卡会让人以为这是六件独立的事，而它们其实是同一份体检的六项读数。
 *
 * 每一行都回答三个问题：测出来多少（主数值）、这项算几分（分段条 + 分数）、为什么（诊断 + 可展开的算法）。
 * 「怎么算的」里的每一行都来自打分函数真实返回的 detail 字段，没有一句是写死的。
 *
 * 配色分两套（SPEC §8.1）：评级条与分值文字用**三档状态色**（≥80 绿 / 30–79 焦橙 / <30 红），
 * 总健康分与病危徽章才用五档等级色。免疫 40.6 属于「偏低」而不是「濒死」，两套色阶别混。
 *
 * 弃权分两种（SPEC §6.0），页面上必须用不同的词：
 *   - `detail.insufficient` —— 项目太年轻，这项测不出东西 →「样本不足」
 *   - 其余 score === null  —— 这一次真没取到数          →「数据缺失」
 * 混成一句会让用户以为 API 挂了，去点「重试」白等一轮。
 * @module components/vital-card
 */

import { vitalTone } from '../metrics.js';
import { esc, icon, num, score as fmtScore } from '../dom.js';

/** 体征的英文副名与图标（图标名必须在 dom.js 的白名单内） */
const META = {
  heartbeat: { en: 'HEART RATE', icon: 'heart-pulse' },
  breathing: { en: 'RESPIRATION', icon: 'wind' },
  busFactor: { en: 'BUS FACTOR', icon: 'user-round' },
  metabolism: { en: 'METABOLISM', icon: 'repeat-2' },
  immunity: { en: 'IMMUNITY', icon: 'shield-check' },
  legacy: { en: 'WILL', icon: 'scroll-text' },
};

/**
 * 分数 → 这一项的状态词。用词按体征各自的行话，不用统一的「好/坏」，
 * 因为「遗嘱：完整」和「代谢：正常」是两种完全不同的判断。
 *
 * 【边界必须与三档色阶严格同界】第一档 ≥80（绿）、第三档 <30（红）。
 * 历史上这里六项各设一套界（心跳 85 / 免疫 70 / 遗嘱 90），结果 express 的呼吸
 * 80.0 分出现「绿色 + 变浅 + 呼吸平稳」三方打架 —— 颜色说好、状态词说差、诊断说好。
 * 这类错审查看不出来，只有把一行文字连起来读才会发现。改边界时先看 vitalTone()。
 * @param {string} key
 * @param {number|null} score
 * @param {boolean} [insufficient] 是否因样本不足弃权
 * @returns {string}
 */
function statusOf(key, score, insufficient = false) {
  // 「样本不足」和「数据缺失」是两件事：前者是项目太年轻，后者是这一次没取到数。
  // 统一写成「数据缺失」会让一个刚开源三周的健康项目看起来像 API 挂了。
  if (typeof score !== 'number') return insufficient ? '样本不足' : '数据缺失';
  const bands = {
    heartbeat: [['正常', 80], ['偏慢', 60], ['明显变慢', 30], ['已停跳', -1]],
    // 呼吸不用「变浅 / 衰竭」这类方向词：moment 的真实数据是 66.7 分但趋势 +10，
    // 诊断语写的是「呼吸在加深」。方向词会和趋势诊断正面打架，改成描述绝对量的「偏少」。
    breathing: [['正常', 80], ['偏少', 60], ['明显偏少', 30], ['已停止', -1]],
    busFactor: [['健康', 80], ['略偏集中', 65], ['过度集中', 30], ['无人维护', -1]],
    metabolism: [['正常', 80], ['放慢', 65], ['迟缓', 30], ['已静止', -1]],
    immunity: [['正常', 80], ['偏低', 40], ['危急', 30], ['已腐烂', -1]],
    // 遗嘱在 ≥80 这一档内部再细分：moment 是 90 分（缺 Usage 章节），诊断语写「缺使用说明」，
    // 若 90 分直接叫「完整」就自相矛盾。100 分才叫完整，80–94 叫基本完整。两档同为绿，不跨色阶。
    legacy: [['完整', 95], ['基本完整', 80], ['有缺口', 60], ['残缺', 30], ['无遗嘱', -1]],
  };
  const hit = (bands[key] ?? []).find(([, min]) => score >= min);
  return hit ? hit[0] : '—';
}

/** 心率分档文字，与 vitals.scoreHeartbeat 的分支逐条对应 */
function heartbeatBand(days) {
  if (days <= 7) return 'd ≤ 7 天 → 100';
  if (days <= 30) return '7 < d ≤ 30 天 → 100 降到 90';
  if (days <= 90) return '30 < d ≤ 90 天 → 90 降到 75';
  if (days <= 180) return '90 < d ≤ 180 天 → 75 降到 55';
  if (days <= 365) return '180 < d ≤ 365 天 → 55 降到 30';
  return 'd > 365 天 → 30 线性归零';
}

/**
 * 「怎么算的」里的每一行。返回值直接渲染成两列表格，全部来自 detail。
 *
 * 三条纪律：
 *   1. 算式里的每个常数都从 detail 读，不写死 —— 呼吸的分母现在随项目年龄缩放，
 *      写死 120 会出现「clamp(40 ÷ 120) = 33.3」但评分 100 的自相矛盾；
 *   2. 取数失败时不拿半截 detail 假装算过一遍（`failed` 分支直接说没取到）；
 *   3. 欠采样 / 保底 / 豁免这类「不是实测值」的分数，要在算式里显式标出来。
 * @param {object} vital
 * @returns {Array<[string, string]>}
 */
function calcRows(vital) {
  const d = vital.detail ?? {};
  const failed = typeof d.score !== 'number';
  const giveUp = '—（本项弃权，权重已重新归一化）';

  switch (vital.key) {
    case 'heartbeat':
      return d.archived
        ? [['归档状态', '仓库已归档 → 心跳直接判 0'], ['评分', '0.0']]
        : [
            ['口径', `距最后一次提交 d = ${num(d.days)} 天`],
            ['分档', heartbeatBand(d.days)],
            ['评分', `heartbeat = ${fmtScore(d.score)}`],
          ];

    case 'breathing': {
      // 分母随项目年龄缩放（SPEC §6.0）：成熟项目 120 次/年，两个月的项目只要求 20 次
      const denom = Number.isFinite(d.expected) ? d.expected : 120;
      const win = Number.isFinite(d.windowMonths) ? d.windowMonths : 12;
      if (d.insufficient) {
        return [
          ['统计窗口', `${num(win)} 个月`],
          ['提交总量', `${num(d.total)} 次`],
          ['为什么弃权', '窗口不足 1 个月，一两条提交就能刷满分，量出来的不是节奏'],
          ['评分', giveUp],
        ];
      }
      // 窗口不足半年时不做趋势：前后两段样本都太小，斜率是噪声
      const trendText =
        win < 6
          ? '窗口不足半年，前后两段样本太小，不做趋势修正 → 0'
          : d.ratio === null
            ? d.prev6 === 0
              ? d.last6 > 0
                ? '前半年 0 次、后半年有提交 → +10'
                : '前后半年都是 0 次 → −10'
              : '无法比较'
            : `后半年 ${d.last6} ÷ 前半年 ${d.prev6} = ${d.ratio} → ${d.trend > 0 ? '+' : ''}${d.trend}`;
      return [
        ['统计窗口', win < 11.5 ? `${num(win)} 个月（分母折算为 ${denom} 次，不是 120）` : '近 12 个月（分母 120 次）'],
        ['提交总量', `${num(d.total)} 次${d.capped ? '（触到 100 条采样上限，实际更多）' : ''}`],
        ['基础分', `clamp(${num(d.total)} ÷ ${denom} × 100) = ${fmtScore(Math.min(100, (d.total / denom) * 100))}`],
        ['趋势修正', trendText],
        ['评分', `breathing = ${fmtScore(d.score)}`],
      ];
    }

    case 'busFactor': {
      const share = `${(d.maxShare * 100).toFixed(1)}%`;
      const tol = Number.isFinite(d.tolerance) ? d.tolerance : 1;
      const rows = [
        ['提交与作者', `${num(d.total)} 次提交 / ${num(d.authors)} 位作者（已排除 bot）`],
        ['单人占比', d.topAuthor ? `${esc(d.topAuthor)} ${num(d.topCount)} 次 = ${share}` : '近 12 个月无人提交'],
        ['作者奖励', d.bonus ? `作者 ≥ ${d.authors >= 8 ? 8 : 4} → +${d.bonus}` : '作者数 < 4 → +0'],
      ];
      // 年龄宽容必须出现在算式里：否则 70% 单人占比却拿 78 分，读者会以为算法算错了
      if (tol < 1) rows.push(['年龄宽容', `建仓不足 12 个月，集中度惩罚打折至 ${tol}（下限 0.35）`]);
      rows.push(['评分', `100 − ${share} × 90 × ${tol} + ${d.bonus} = ${fmtScore(d.score)}`]);
      return rows;
    }

    case 'metabolism':
      if (failed) return [['取样', '这一次没取到 release 列表'], ['评分', giveUp]];
      return d.days === null
        ? [
            ['发布记录', '没有任何 release'],
            [
              '口径',
              d.youngExempt
                ? '建仓不足半年，还没到该发版的阶段 → 中性分 70'
                : '成熟项目从未发版 → 中性分 45',
            ],
            ['评分', fmtScore(d.score)],
          ]
        : [
            ['最近发版', `${esc(d.tag ?? '—')} · ${num(d.days)} 天前`],
            ['分档', `d = ${num(d.days)} 天 → ${d.base}`],
            ['加成', `近 12 个月 ${d.recentCount} 个版本 → +${d.bonus}`],
            ['评分', `metabolism = ${fmtScore(d.score)}`],
          ];

    case 'immunity':
      if (d.insufficient) {
        return [
          ['建仓时长', '不足 3 个月'],
          ['为什么弃权', '不可能存在「超过 90 天未更新」的 issue，这一项恒为满分，没有区分度'],
          ['积压总量', `${num(d.backlog)} 条（仓库字段，未抽样）`],
          ['评分', giveUp],
        ];
      }
      if (failed) return [['取样', '这一次没取到 issue 列表'], ['评分', giveUp]];
      return [
        ['未关闭 issue', `${num(d.open)} 条（已排除 PR）`],
        ['陈旧占比', `${num(d.stale)} 条 > 90 天未更新 = ${(d.staleRatio * 100).toFixed(1)}%`],
        ['积压惩罚', `存量 ${num(d.backlog)} 条 → ${d.penalty}`],
        ['评分', `(100 − ${(d.staleRatio * 100).toFixed(1)}) + (${d.penalty}) = ${fmtScore(d.score)}`],
      ];

    case 'legacy':
      if (failed) return [['取样', '这一次没取到 README 原文'], ['评分', giveUp]];
      return [
        ...(d.items ?? []).map((item) => [item.label, item.hit ? `${item.points} 分` : '未命中']),
        // 保底不是实测，算式里必须写出来，否则「clamp(55) = 60.0」看着像算错了
        [
          '评分',
          d.floored
            ? `clamp(${fmtScore(d.raw)}) = ${fmtScore(d.raw)} → 新项目保底 ${fmtScore(d.score)}`
            : `clamp(${fmtScore(d.raw)}) = ${fmtScore(d.score)}`,
        ],
      ];

    default:
      return [];
  }
}

/**
 * 渲染一项体征。
 * @param {object} vital analyze() 产出的单项（含 label / score / value / unit / diagnosis / formula / detail）
 * @returns {string} HTML
 */
export function vitalCard(vital) {
  const meta = META[vital.key] ?? { en: '', icon: 'circle-dot' };
  const hasScore = typeof vital.score === 'number';
  // 样本不足（项目太年轻）与数据缺失（这次没取到）在视觉上是同一件事——没数——
  // 但在语义上是两件事，必须用不同的词，否则用户会去点「重试」白等一轮。
  const insufficient = vital.detail?.insufficient === true;
  // 单项体征走三档状态色（SPEC §8.1）。五档等级色只属于总健康分与病危徽章，这里绝不混用。
  const tone = vitalTone(vital.score);
  const color = tone ? `var(--level-${tone})` : 'var(--meta)';
  const filled = hasScore ? Math.max(0, Math.min(5, Math.round(vital.score / 20))) : 0;

  const bars = Array.from({ length: 5 }, (_, i) => `<i${i < filled ? ' class="on"' : ''}></i>`).join('');
  let value;
  if (vital.value === null || vital.value === undefined) {
    const missing = !hasScore
      ? insufficient
        ? '样本不足'
        : '数据缺失'
      : vital.key === 'metabolism'
        ? '未发版'
        : '无记录';
    value = `<span class="v-missing">${missing}</span>`;
  } else {
    value = `<span class="v-num num">${num(vital.value)}</span><span class="v-unit">${esc(vital.unit)}</span>`;
  }

  const rows = calcRows(vital)
    .map(([key, text]) => `<div class="calc-row"><span>${esc(key)}</span><span>${text}</span></div>`)
    .join('');

  return `<article class="vital" id="vital-${vital.key}">
      <div class="v-hd">
        <div class="v-ic">${icon(meta.icon)}</div>
        <div class="v-title">
          <h3>${esc(vital.label)}</h3>
          <div class="v-en">${meta.en}</div>
        </div>
        <div class="v-value">${value}</div>
      </div>
      <div class="v-chiprow">
        <div class="bars" style="--c:${color}" aria-hidden="true">${bars}</div>
        <span class="v-score" style="--c:${color}">
          <i class="sdot" aria-hidden="true"></i>
          <span class="st">${statusOf(vital.key, vital.score, insufficient)}</span>
          <span>·</span><b>${fmtScore(vital.score)}</b><span>分</span>
          <span>·</span><span>权重 ${Math.round((vital.effectiveWeight ?? vital.weight) * 100)}%</span>
        </span>
      </div>
      <p class="v-diag">${esc(vital.diagnosis)}</p>
      <details class="calc">
        <summary>怎么算的 ${icon('chevron-down', 'ic', 'chev')}</summary>
        <div class="calc-box">
          ${rows}
          <p class="calc-formula">${esc(vital.formula)}</p>
        </div>
      </details>
    </article>`;
}
