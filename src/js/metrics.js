/**
 * Code ICU · 六项体征指标引擎（汇总层）
 *
 * 纯函数模块：不访问 window / document / localStorage / fetch，
 * 可以直接在 Node 里 `import` 跑回归（tests/verify.mjs 就是这么用的）。
 * 打分函数逐个住在 vitals.js，本文件负责把六个分数装配成一份完整体检报告。
 *
 * 降级约定：某一数据源缺失时对应体征 `score: null`（弃权），
 * computeHealth 会把剩余项权重重新归一化，绝不把缺失项当 0 分或 100 分。
 * @module metrics
 */

import {
  LEVELS,
  REMAINING_DAYS_MAX,
  REMAINING_DAYS_MIN,
  REMAINING_MIN_AGE_DAYS,
  UNKNOWN_LEVEL,
  VITAL_LABELS,
  WEIGHTS,
} from './config.js';
import { DIAGNOSIS, FORMULAS } from './copy.js';
import {
  ageMonthsOf,
  clamp,
  daysBetween,
  scoreBreathing,
  scoreBusFactor,
  scoreHeartbeat,
  scoreImmunity,
  scoreLegacy,
  scoreMetabolism,
} from './vitals.js';

export {
  ageMonthsOf,
  clamp,
  daysBetween,
  scoreBreathing,
  scoreBusFactor,
  scoreHeartbeat,
  scoreImmunity,
  scoreLegacy,
  scoreMetabolism,
};

/**
 * 加权求和。任一维度为 null 时其权重被剔除，剩余权重重新归一化后计算。
 * @param {Record<string, number|null>} scores 六项分数
 * @param {Record<string, number>} [weights]
 * @returns {number|null} 全部弃权时返回 null
 */
export function computeHealth(scores, weights = WEIGHTS) {
  let sum = 0;
  let totalWeight = 0;
  for (const key of Object.keys(weights)) {
    const value = scores[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    sum += value * weights[key];
    totalWeight += weights[key];
  }
  return totalWeight === 0 ? null : Math.round(sum / totalWeight);
}

/**
 * 健康分 → 病危等级。`tone` 直接拼成设计 Token 变量名 `--level-{tone}`，视图层不再写映射。
 * @param {number|null} health
 * @returns {{level: string, label: string, tone: string, summary: string}}
 */
export function classify(health) {
  if (typeof health !== 'number' || !Number.isFinite(health)) return { ...UNKNOWN_LEVEL };
  const hit = LEVELS.find((item) => health >= item.min) ?? LEVELS[LEVELS.length - 1];
  return { level: hit.level, label: hit.label, tone: hit.tone, summary: hit.summary };
}

/**
 * 单项体征分 → **三档状态色**（SPEC §8.1）。与 `classify()` 的五档等级色是两套色阶，不得混用。
 *
 * 为什么不能复用五档：免疫 40.6 套五档落在 30–49 的「ICU 深橙」，读起来像濒死，
 * 但它只是「偏低」；套三档才是准确的偏低色。总分才需要五档分诊刻度。
 *
 * 【必须用 icu 不是 ward】中间档取 `--level-icu`（焦橙，tokens.css 里的 ember），
 * 不能取 `--level-ward`（琥珀，tokens.css 里的 warn）。依据是已验收的社媒对比图
 * social-fig2-compare.html：那里 45.0 与 70.0 都是 icu。两边一旦不同色，
 * 同一个分数会在报告页和传播图上长得不一样，属硬伤。
 * @param {number|null} score
 * @returns {'healthy'|'icu'|'dead'|null} 拼成 `--level-{tone}`；弃权返回 null
 */
export function vitalTone(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (score >= 80) return 'healthy';
  if (score >= 30) return 'icu';
  return 'dead';
}

/**
 * 寿命推演（SPEC §6）。页面必须同时展示 REMAINING_FORMULA，明确是推演不是预言。
 * @param {number|null} health 健康分
 * @param {number|null} daysSincePush 停更天数
 * @returns {number|null} 剩余天数；健康分未知时返回 null
 */
export function estimateRemainingDays(health, daysSincePush) {
  if (typeof health !== 'number' || !Number.isFinite(health)) return null;
  const days = Number.isFinite(daysSincePush) ? Math.max(0, daysSincePush) : 720;
  const decay = 1 / (1 + days / 180);
  return clamp(Math.round((health / 100) * 365 * decay), REMAINING_DAYS_MIN, REMAINING_DAYS_MAX);
}

/**
 * 每项体征展示用的「主数值 + 单位」，让人一眼看到背后测的是什么。
 * 单位刻意写得能直接接在数字后面（"2 天未提交"、"51 %僵尸"），视图层不要自行拼接单位。
 * @param {Record<string, any>} results 六项打分函数的返回值
 * @returns {Record<string, {value: number|null, unit: string}>}
 */
function displayValues(results) {
  const finite = (value) => (Number.isFinite(value) ? value : null);
  // 呼吸的统计窗口会随项目年龄缩放，「40 次/年」对一个只活了两个月的仓库是虚报六倍。
  // 成熟项目窗口就是 12 个月，仍显示「次/年」；年轻项目按真实窗口说「次/N 个月」。
  const win = results.breathing.windowMonths;
  const breathUnit =
    Number.isFinite(win) && win < 11.5 ? `次/${Math.round(win * 10) / 10} 个月` : '次/年';
  return {
    heartbeat: { value: finite(results.heartbeat.days), unit: '天未提交' },
    breathing: { value: finite(results.breathing.total), unit: breathUnit },
    busFactor: { value: Math.round(results.busFactor.maxShare * 100), unit: '%单人提交' },
    metabolism: { value: finite(results.metabolism.days), unit: '天未发版' },
    immunity: { value: Math.round(results.immunity.staleRatio * 100), unit: '%僵尸' },
    legacy: { value: finite(results.legacy.chars), unit: '字' },
  };
}

/**
 * 病史时间轴要用的几个真实日期。视图层不应该自己去翻原始 commits / releases，
 * 所以在这里一次性提取干净。全部来自 API 字段，没有任何编造值。
 * @param {{created_at?: string|null, pushed_at?: string|null}|null} repo
 * @param {Array<any>|null} commits
 * @param {Array<any>|null} releases
 * @returns {{createdAt: string|null, lastCommitAt: string|null, lastReleaseAt: string|null, lastReleaseTag: string|null}}
 */
function buildTimeline(repo, commits, releases) {
  let lastCommitAt = repo?.pushed_at ?? null;
  if (Array.isArray(commits)) {
    for (const item of commits) {
      const iso = item?.commit?.committer?.date ?? null;
      if (!iso) continue;
      if (!lastCommitAt || new Date(iso).getTime() > new Date(lastCommitAt).getTime()) lastCommitAt = iso;
    }
  }
  let lastReleaseAt = null;
  let lastReleaseTag = null;
  if (Array.isArray(releases)) {
    for (const item of releases) {
      const iso = item?.published_at ?? null;
      if (!iso) continue;
      if (!lastReleaseAt || new Date(iso).getTime() > new Date(lastReleaseAt).getTime()) {
        lastReleaseAt = iso;
        lastReleaseTag = item.tag_name ?? null;
      }
    }
  }
  return { createdAt: repo?.created_at ?? null, lastCommitAt, lastReleaseAt, lastReleaseTag };
}

/**
 * README 是否在第一屏宣布自己废弃。只认前 3 个非空行：这句话的价值就在于它写在最上面，
 * 埋在文档中段的 "deprecated" 是历史沿革，拿出来当主诉会冤枉一个还在维护的项目。
 *
 * 注意与 `archived` 区分（SPEC 追加规则）：`request/request` 的 `archived` 是 false，
 * 所以文案只能说「README 第一行写着 Deprecated」，不能说「仓库已停止维护」。
 * @param {string|null|undefined} readme
 * @returns {boolean|null} 没有 README 原文时返回 null（未知，不是 false）
 */
function readmeDeclaresDeprecated(readme) {
  if (typeof readme !== 'string' || !readme.trim()) return null;
  const head = readme
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
    .toLowerCase();
  return /deprecated|unmaintained|no longer maintained|停止维护|不再维护|已废弃/.test(head);
}

/**
 * 汇总一次完整体检结果。文案、权重、公式在此一次性装配，视图层只做渲染。
 * @param {object} bundle fetchBundle 的返回值（或同形状的预置快照）
 * @param {{now?: Date|string|number}} [options]
 * @returns {{health: number|null, level: object, remainingDays: number|null,
 *   daysSincePush: number|null, vitals: Array<object>, scores: Record<string, number|null>,
 *   degraded: string[], weights: Record<string, number>, repo: object|null,
 *   timeline: object, readmeDeprecated: boolean|null, flags: object,
 *   fetchedAt: string|null, analyzedAt: string}}
 */
export function analyze(bundle, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const repo = bundle?.repo ?? null;
  const flags = bundle?.flags ?? {};

  // 项目年龄：所有「按年归一化」的体征都要用它（SPEC §6.0）。
  // 拿不到 created_at 时为 null，各体征退回成熟项目的原口径。
  const ageMonths = ageMonthsOf(repo?.created_at, now);

  // 数据源失败 → 传 null 给打分函数，让它返回 score: null（弃权）而不是拿假数据算分
  const results = {
    heartbeat: scoreHeartbeat(repo, now),
    breathing: scoreBreathing(bundle?.commits ?? null, now, ageMonths),
    busFactor: scoreBusFactor(bundle?.commits ?? null, ageMonths),
    metabolism: scoreMetabolism(flags.releasesFailed ? null : bundle?.releases ?? null, now, ageMonths),
    immunity: scoreImmunity(flags.issuesFailed ? null : bundle?.issues ?? null, repo, now, ageMonths),
    legacy: flags.readmeFailed
      ? { score: null, items: [], raw: 0, chars: 0, floored: false }
      : scoreLegacy(repo, bundle?.readme ?? null, ageMonths),
  };

  /** @type {Record<string, number|null>} */
  const scores = {};
  for (const key of Object.keys(WEIGHTS)) scores[key] = results[key].score;

  const health = computeHealth(scores);
  const presentWeight = Object.keys(WEIGHTS).reduce(
    (sum, key) => (scores[key] === null ? sum : sum + WEIGHTS[key]),
    0,
  );
  const shown = displayValues(results);

  const vitals = Object.keys(WEIGHTS).map((key) => ({
    key,
    label: VITAL_LABELS[key],
    score: scores[key],
    weight: WEIGHTS[key],
    /** 归一化后的实际权重，页面上可以直接说明「这一项在总分里占多少」 */
    effectiveWeight:
      presentWeight > 0 && scores[key] !== null ? Math.round((WEIGHTS[key] / presentWeight) * 1000) / 1000 : 0,
    // 弃权项不展示原始数值：0 会被误读成真实测量结果（例如「0% 僵尸」）
    value: scores[key] === null ? null : shown[key].value,
    unit: shown[key].unit,
    diagnosis: DIAGNOSIS[key](results[key]),
    formula: FORMULAS[key],
    detail: results[key],
  }));

  const ageDaysRaw = daysBetween(repo?.created_at, now);
  const ageDays = Number.isFinite(ageDaysRaw) ? ageDaysRaw : null;

  // 弃权有两种，页面必须说清是哪一种（SPEC §6.0）：
  //   insufficient —— 项目太年轻，这一项根本测不出东西（不是接口挂了）
  //   failed       —— 这一次真的没取到数据
  // 混成一句「数据缺失」会让用户以为 GitHub API 出问题，进而去点「重试」，白等一轮。
  const insufficient = Object.keys(WEIGHTS).filter((key) => results[key].insufficient === true);
  const failed = Object.keys(WEIGHTS).filter(
    (key) => scores[key] === null && results[key].insufficient !== true,
  );

  return {
    health,
    level: classify(health),
    // 项目太年轻（不足 30 天）时不做寿命推演：对一个刚活了几天的仓库说「还能活 328 天」
    // 没有信息量，只有荒谬感。宁可不给数字，也不给一个没法自证的数。
    remainingDays:
      ageDays !== null && ageDays < REMAINING_MIN_AGE_DAYS ? null : estimateRemainingDays(health, results.heartbeat.days),
    ageMonths,
    ageDays,
    daysSincePush: Number.isFinite(results.heartbeat.days) ? results.heartbeat.days : null,
    vitals,
    scores,
    /** 全部弃权项（两种原因合在一起，兼容既有调用方） */
    degraded: Object.keys(WEIGHTS).filter((key) => scores[key] === null),
    /** 因项目太年轻而弃权的项 */
    insufficient,
    /** 因取数失败而弃权的项 */
    failed,
    weights: { ...WEIGHTS },
    repo,
    timeline: buildTimeline(repo, bundle?.commits ?? null, flags.releasesFailed ? null : bundle?.releases ?? null),
    /** README 第一屏是否自述废弃；null = 没取到原文（未知） */
    readmeDeprecated: flags.readmeFailed ? null : readmeDeclaresDeprecated(bundle?.readme),
    flags,
    fetchedAt: bundle?.fetchedAt ?? null,
    analyzedAt: now.toISOString(),
  };
}
