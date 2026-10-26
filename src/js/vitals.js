/**
 * Code ICU · 六项体征打分函数
 *
 * 纯函数模块：不访问 window / document / localStorage / fetch，
 * 因此可以直接在 Node 里 `import` 做回归（tests/verify.mjs 就是这么用的）。
 * 所有分数由输入数据确定性推导，没有任何随机数（SPEC §6 红线）。
 *
 * 每个函数在数据缺失时返回 `score: null`（弃权而不是 0 分），
 * 由 metrics.computeHealth 对剩余项权重重新归一化。
 * @module vitals
 */

import {
  BREATHING_FULL_COMMITS,
  BREATHING_MIN_WINDOW_MONTHS,
  BREATHING_TREND_MIN_MONTHS,
  BUS_FACTOR_NO_COMMIT_SCORE,
  LEGACY_INFANT_MIN_SCORE,
  METABOLISM_NO_RELEASE_SCORE,
  METABOLISM_YOUNG_NO_RELEASE_SCORE,
  PER_PAGE_COMMITS,
  PROJECT_INFANT_MONTHS,
  PROJECT_MATURE_MONTHS,
  README_LONG_CHARS,
  STALE_ISSUE_DAYS,
} from './config.js';

const DAY_MS = 86400000;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** 保留一位小数：页面展示与 health 加权必须能对上账 */
const round1 = (value) => Math.round(value * 10) / 10;

/**
 * 距今多少天（向下取整），即 SPEC 的 `d(x) = floor((now - x) / 86400000)`。
 * @param {string|null|undefined} fromISO ISO 时间字符串
 * @param {Date} [now] 参照时刻
 * @returns {number} 无法解析时返回 Infinity（语义为「极其陈旧」，自然落入各算法的最差分支）
 */
export function daysBetween(fromISO, now = new Date()) {
  if (!fromISO) return Number.POSITIVE_INFINITY;
  const time = new Date(fromISO).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - time) / DAY_MS);
}

/**
 * 项目已存在多少个月（SPEC §6.0）。所有「按年归一化」的体征都要用这个值。
 *
 * 一年按 365.25/12 = 30.44 天计，避免用 `setMonth` 在月末溢出。
 * 返回 null 表示拿不到创建时间——此时各体征按「成熟项目」的原有口径计算，
 * 即退化成修改前的行为，不会因为缺一个字段而让分数飞到天上。
 * @param {string|null|undefined} createdAt `repo.created_at`
 * @param {Date} [now]
 * @returns {number|null} 例如 2.3 表示两个多月；无法解析返回 null
 */
export function ageMonthsOf(createdAt, now = new Date()) {
  if (!createdAt) return null;
  const time = new Date(createdAt).getTime();
  if (!Number.isFinite(time)) return null;
  const months = (now.getTime() - time) / (DAY_MS * 30.44);
  if (!Number.isFinite(months)) return null;
  return Math.max(0, Math.round(months * 10) / 10);
}

/**
 * 1) 心跳 heartbeat —— 距最后一次提交多久（SPEC §6.1）。
 * 已归档仓库直接 0，不进分段。
 * @param {{pushed_at?: string|null, archived?: boolean}|null} repo
 * @param {Date} [now]
 * @returns {{score: number|null, days: number|null, archived: boolean}}
 */
export function scoreHeartbeat(repo, now = new Date()) {
  if (!repo) return { score: null, days: null, archived: false };
  const days = daysBetween(repo.pushed_at, now);
  if (repo.archived === true) return { score: 0, days, archived: true };
  let raw;
  if (days <= 7) raw = 100;
  else if (days <= 30) raw = 100 - ((days - 7) / 23) * 10;
  else if (days <= 90) raw = 90 - ((days - 30) / 60) * 15;
  else if (days <= 180) raw = 75 - ((days - 90) / 90) * 20;
  else if (days <= 365) raw = 55 - ((days - 180) / 185) * 25;
  else raw = Math.max(0, 30 - ((days - 365) / 365) * 30);
  return { score: round1(clamp(raw, 0, 100)), days, archived: false };
}

/**
 * 2) 呼吸 breathing —— 近 12 个月提交密度与趋势（SPEC §6.2）。
 * `monthly` 长度恒为 12：索引 0 是 11 个月前，索引 11 是当月。
 * @param {Array<any>|null} commits
 * @param {Date} [now]
 * @param {number|null} [ageMonths] 项目已存在月数，由 `ageMonthsOf()` 给出
 * @returns {{score: number|null, monthly: number[], capped: boolean, last6: number,
 *   prev6: number, trend: number, total: number, ratio: number|null,
 *   windowMonths: number, expected: number}}
 */
export function scoreBreathing(commits, now = new Date(), ageMonths = null) {
  const monthly = new Array(12).fill(0);
  const age = Number.isFinite(ageMonths) ? Math.max(0, ageMonths) : null;
  /** 有效统计窗口（月）：项目不足一年时只按它活过的月数算 */
  const windowMonths = age === null ? PROJECT_MATURE_MONTHS : Math.min(PROJECT_MATURE_MONTHS, age);

  if (!Array.isArray(commits)) {
    return { score: null, monthly, capped: false, last6: 0, prev6: 0, trend: 0, total: 0, ratio: null, windowMonths, expected: 0 };
  }
  // 分母与计数先算出来：即使下面弃权，total 也必须是真实值，
  // 否则页面上会显示「0 次提交」（实际有 8 次），把「没量」误述成「量到 0」。
  const total = commits.length;
  const capped = total >= PER_PAGE_COMMITS;
  const nowMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  for (const item of commits) {
    const iso = item?.commit?.committer?.date ?? null;
    const time = iso ? new Date(iso).getTime() : NaN;
    if (!Number.isFinite(time)) continue;
    const stamp = new Date(time);
    const index = 11 - (nowMonth - (stamp.getUTCFullYear() * 12 + stamp.getUTCMonth()));
    if (index >= 0 && index < 12) monthly[index] += 1;
  }
  const last6 = monthly.slice(6).reduce((sum, n) => sum + n, 0);
  const prev6 = monthly.slice(0, 6).reduce((sum, n) => sum + n, 0);
  const expected = BREATHING_FULL_COMMITS * (windowMonths / PROJECT_MATURE_MONTHS);

  // 项目存在不足一个月：分母会小到让一条提交就刷满，样本无意义，弃权交给权重归一化
  if (windowMonths < BREATHING_MIN_WINDOW_MONTHS) {
    return {
      score: null, monthly, capped, last6, prev6, trend: 0, total,
      ratio: null, windowMonths, expected: Math.round(expected), insufficient: true,
    };
  }

  // 分母按窗口缩放：成熟项目仍是 120，2 个月的新项目只要求 20 次
  const base = clamp((total / expected) * 100, 0, 100);

  // 趋势：窗口不足半年时，前后两段样本都太小，算出来的斜率是噪声，不参与
  let trend = 0;
  let ratio = null;
  if (windowMonths >= BREATHING_TREND_MIN_MONTHS) {
    if (prev6 === 0) {
      trend = last6 > 0 ? 10 : -10;
    } else {
      ratio = last6 / prev6;
      trend = ratio >= 1.3 ? 10 : ratio >= 0.8 ? 0 : ratio >= 0.5 ? -8 : -15;
    }
  }

  return {
    score: round1(clamp(base + trend, 0, 100)),
    monthly,
    capped,
    last6,
    prev6,
    trend,
    total,
    ratio: ratio === null ? null : Math.round(ratio * 100) / 100,
    windowMonths: Math.round(windowMonths * 10) / 10,
    expected: Math.round(expected),
  };
}

/**
 * 3) 单人依赖度 busFactor —— Bus Factor（SPEC §6.3）。
 * 只用近 12 个月提交作者，不用 lifetime contributors：
 * lifetime 会让二十年老项目永远显得「依赖创始人」，近一年作者分布才反映当下真实风险。
 * 排除 `author.login` 以 `[bot]` 结尾者；无 GitHub 账号关联的提交（author 为 null）无法归属，一并跳过。
 * @param {Array<any>|null} commits
 * @param {number|null} [ageMonths] 项目已存在月数，由 `ageMonthsOf()` 给出
 * @returns {{score: number|null, authors: number, total: number, maxShare: number,
 *   topAuthor: string|null, topCount: number, bonus: number, tolerance: number}}
 */
export function scoreBusFactor(commits, ageMonths = null) {
  const empty = { score: null, authors: 0, total: 0, maxShare: 0, topAuthor: null, topCount: 0, bonus: 0, tolerance: 1 };
  if (!Array.isArray(commits)) return empty;

  /** @type {Map<string, number>} */
  const counts = new Map();
  let total = 0;
  for (const item of commits) {
    const login = item?.author?.login ?? null;
    if (!login || login.endsWith('[bot]')) continue;
    total += 1;
    counts.set(login, (counts.get(login) ?? 0) + 1);
  }
  if (total === 0) return { ...empty, score: BUS_FACTOR_NO_COMMIT_SCORE };

  let topAuthor = null;
  let topCount = 0;
  for (const [login, count] of counts) {
    if (count > topCount) {
      topAuthor = login;
      topCount = count;
    }
  }
  const authors = counts.size;
  const maxShare = topCount / total;
  const bonus = authors >= 8 ? 8 : authors >= 4 ? 4 : 0;

  // 年龄宽容：单一作者在项目早期是常态，与「二十年的项目只剩一个人」不是同一种风险。
  // 按存在月数 / 12 对集中度惩罚打折，满 12 个月后完全生效（成熟项目的分数一分不变）。
  //
  // 下限 0.35 不能省：纯线性打折会让一个两周大、单人 100% 的仓库拿到 96 分「健康」，
  // 而 Bus Factor = 1 本身就是事实风险，无论项目多年轻。保留下限意味着早期仍扣约 31 分，
  // 只是不至于像成熟项目那样一票打成 10 分。
  const age = Number.isFinite(ageMonths) ? Math.max(0, ageMonths) : null;
  const tolerance = age === null ? 1 : clamp(age / PROJECT_MATURE_MONTHS, 0.35, 1);

  return {
    score: round1(clamp(100 - maxShare * 90 * tolerance + bonus, 0, 100)),
    authors,
    total,
    maxShare,
    topAuthor,
    topCount,
    bonus,
    tolerance: Math.round(tolerance * 100) / 100,
  };
}

/**
 * 4) 代谢 metabolism —— 发版节奏（SPEC §6.4）。
 * 不发版不等于有病，给中性分 45。
 * @param {Array<any>|null} releases
 * @param {Date} [now]
 * @returns {{score: number|null, days: number|null, base: number, bonus: number,
 *   recentCount: number, tag: string|null}}
 */
export function scoreMetabolism(releases, now = new Date(), ageMonths = null) {
  const age = Number.isFinite(ageMonths) ? Math.max(0, ageMonths) : null;
  // 不足半年的新项目还没到该发版的阶段。45 分是「中性偏低」，会把「还没发版」
  // 误读成「发版停滞」，所以年轻项目单独给一个更高的中性分。
  const youngExempt = age !== null && age < 6;
  const noReleaseScore = youngExempt ? METABOLISM_YOUNG_NO_RELEASE_SCORE : METABOLISM_NO_RELEASE_SCORE;
  const neutral = { score: noReleaseScore, days: null, base: noReleaseScore, bonus: 0, recentCount: 0, tag: null, youngExempt };
  if (!Array.isArray(releases)) return { ...neutral, score: null, base: 0 };
  if (releases.length === 0) return neutral;

  let latestTime = NaN;
  let tag = null;
  let recentCount = 0;
  for (const item of releases) {
    const time = item?.published_at ? new Date(item.published_at).getTime() : NaN;
    if (!Number.isFinite(time)) continue;
    if (Number.isNaN(latestTime) || time > latestTime) {
      latestTime = time;
      tag = item.tag_name ?? null;
    }
    if ((now.getTime() - time) / DAY_MS <= 365) recentCount += 1;
  }
  if (Number.isNaN(latestTime)) return neutral;

  const days = Math.floor((now.getTime() - latestTime) / DAY_MS);
  const base = days <= 30 ? 100 : days <= 90 ? 85 : days <= 180 ? 70 : days <= 365 ? 50 : days <= 730 ? 30 : 15;
  const bonus = Math.min(10, recentCount * 2);
  return { score: round1(clamp(base + bonus, 0, 100)), days, base, bonus, recentCount, tag };
}

/**
 * 5) 免疫 immunity —— issue 积压与僵尸 issue（SPEC §6.5）。
 * `/issues` 会混入 PR，必须先剔除带 `pull_request` 字段的条目，否则免疫分被系统性低估。
 * @param {Array<any>|null} issues
 * @param {{open_issues_count?: number}|null} repo
 * @param {Date} [now]
 * @returns {{score: number|null, open: number, stale: number, staleRatio: number,
 *   backlog: number, penalty: number, base: number}}
 */
export function scoreImmunity(issues, repo, now = new Date(), ageMonths = null) {
  const backlog = repo?.open_issues_count ?? 0;
  const age = Number.isFinite(ageMonths) ? Math.max(0, ageMonths) : null;
  // 项目存在不足 90 天，不可能有「超过 90 天未更新」的 issue，这一项恒定满分，
  // 等于白送 100 分。样本测不出东西时应当弃权，让权重归一化，而不是给个假的满分。
  if (age !== null && age < PROJECT_INFANT_MONTHS) {
    return { score: null, open: 0, stale: 0, staleRatio: 0, backlog, penalty: 0, base: 0, insufficient: true };
  }
  if (!Array.isArray(issues)) {
    return { score: null, open: 0, stale: 0, staleRatio: 0, backlog, penalty: 0, base: 0, insufficient: false };
  }
  const open = issues.filter((item) => item != null && item.pull_request == null);
  if (open.length === 0) {
    return { score: 100, open: 0, stale: 0, staleRatio: 0, backlog, penalty: 0, base: 100, insufficient: false };
  }
  const stale = open.filter((item) => daysBetween(item.updated_at, now) > STALE_ISSUE_DAYS).length;
  const staleRatio = stale / open.length;
  const base = 100 - staleRatio * 100;
  const penalty = backlog > 500 ? -15 : backlog > 200 ? -8 : backlog > 50 ? -3 : 0;
  return {
    score: round1(clamp(base + penalty, 0, 100)),
    open: open.length,
    stale,
    staleRatio,
    backlog,
    penalty,
    base: round1(base),
    insufficient: false,
  };
}

/* ------------------------------------------------------------------ *
 * 6) 遗嘱 legacy —— 许可证与文档完备度（SPEC §6.6）
 *
 * 章节只认标题行（`#` / `**` / `__` 开头），避免正文里随便一句 "install" 就加分，
 * 否则几乎每个仓库都会白拿 10 分，指标失去区分度。
 * ------------------------------------------------------------------ */

const SECTION = '(?:^|\\n)[ \\t]{0,3}(?:#{1,6}[ \\t]*|\\*\\*|__)[^\\n]{0,60}?';
const SECTION_RES = {
  install: new RegExp(`${SECTION}(?:install|安装|getting started)`, 'i'),
  usage: new RegExp(`${SECTION}(?:usage|quick ?start|使用)`, 'i'),
  license: new RegExp(`${SECTION}(?:licen[cs]e|许可)`, 'i'),
};
const BADGE_RE = /shields\.io|\bbadges?\b/i;

/**
 * 许可证 + 文档完备度累加。已归档扣 100 分，直接归零。
 * @param {{license?: any, archived?: boolean}|null} repo
 * @param {string|null} readmeText README 原文；null 表示仓库确实没有 README（不是取数失败）
 * @param {number|null} [ageMonths] 项目已存在月数
 * @returns {{score: number|null, items: Array<{label: string, points: number, hit: boolean}>,
 *   raw: number, chars: number, floored: boolean}}
 */
export function scoreLegacy(repo, readmeText, ageMonths = null) {
  if (!repo) return { score: null, items: [], raw: 0, chars: 0, floored: false };
  const text = typeof readmeText === 'string' ? readmeText : '';
  const hasReadme = text.length > 0;
  /** @type {Array<{label: string, points: number, hit: boolean}>} */
  const items = [];
  const add = (label, points, hit) => items.push({ label, points: hit ? points : 0, hit });
  add('许可证', 40, Boolean(repo.license));
  add('README', 15, hasReadme);
  add('README 超过 1500 字', 10, text.length > README_LONG_CHARS);
  add('安装说明', 10, SECTION_RES.install.test(text));
  add('使用说明', 10, SECTION_RES.usage.test(text));
  add('许可声明', 10, SECTION_RES.license.test(text));
  add('状态徽章', 5, BADGE_RE.test(text));
  add('仓库已归档', -100, repo.archived === true);
  const raw = items.reduce((sum, item) => sum + item.points, 0);
  const score = round1(clamp(raw, 0, 100));

  // 婴儿期项目 README 还没写完是常态，不该被判成「遗嘱残缺」。
  // 只保底不封顶：本来就写得全的项目仍是满分，保底只对「刚开始写」的生效。
  const age = Number.isFinite(ageMonths) ? Math.max(0, ageMonths) : null;
  const floorTo = age !== null && age < PROJECT_INFANT_MONTHS ? LEGACY_INFANT_MIN_SCORE : 0;
  const finalScore = Math.max(score, floorTo);
  return { score: finalScore, items, raw, chars: text.length, floored: finalScore !== score };
}
