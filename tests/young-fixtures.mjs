/**
 * Code ICU · 年轻项目回归的造数夹具
 *
 * 从 young-cases.mjs 拆出来只为一件事：让两边的单文件都留在 300 行以内。
 * 这里只造「fetchBundle 同形状」的输入，不藏任何断言。
 * @module tests/young-fixtures
 */

import { analyze } from '../src/js/metrics.js';

export const DAY = 86400000;
export const NOW = new Date('2026-10-26T00:00:00Z');

/** 造 n 条提交，摊在最近 spanDays 天内，作者按 shares 分配 */
export function mkCommits(n, shares, spanDays, now = NOW) {
  const out = [];
  for (const [login, share] of Object.entries(shares)) {
    const count = Math.max(1, Math.round(n * share));
    for (let i = 0; i < count; i += 1) {
      const daysAgo = Math.round((i / count) * spanDays);
      out.push({
        commit: { committer: { date: new Date(now.getTime() - daysAgo * DAY).toISOString() } },
        author: { login },
      });
    }
  }
  return out;
}

/** ISO 时间：距今多少个月（一年按 30.44 天，与 ageMonthsOf 同口径） */
export const monthsAgo = (months, now = NOW) =>
  new Date(now.getTime() - months * 30.44 * DAY).toISOString();

/** 造 n 条 issue，最后更新都在 daysAgo 天前 */
export const issueSet = (n, daysAgo, now = NOW) =>
  Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    updated_at: new Date(now.getTime() - daysAgo * DAY).toISOString(),
  }));

export const FULL_README = `# Proj\n\n## Install\nnpm i\n\n## Usage\nx()\n\n## License\nMIT\n\n![b](https://shields.io/x)\n${'a'.repeat(1600)}\n`;
export const MID_README = '# Proj\n\n## Install\nnpm i\n\n## Usage\nx()\n';
export const THIN_README = '# Proj\n\n试试看。\n';

/** 一个刚起步仓库的 repo 字段，字段名与 GitHub API 一致 */
export function youngRepo(months, issueCount, now = NOW, extra = {}) {
  return {
    full_name: 'young/proj',
    name: 'proj',
    owner: { login: 'young' },
    description: '一个刚起步的库',
    language: 'TypeScript',
    stargazers_count: 12,
    forks_count: 2,
    open_issues_count: issueCount,
    created_at: monthsAgo(months, now),
    pushed_at: new Date(now.getTime() - 2 * DAY).toISOString(),
    archived: false,
    license: { spdx_id: 'MIT' },
    default_branch: 'main',
    ...extra,
  };
}

/**
 * 拼一个 fetchBundle 同形状的 bundle 交给真正的 analyze()。
 * 直接调打分函数会漏掉「调用方有没有传 ageMonths」这类缺陷，所以必须走全链路。
 * @param {{months: number, commits: any[], releases?: any[], issues?: any[], readme?: string, now?: Date}} spec
 */
export function reportOf(spec) {
  const now = spec.now ?? NOW;
  const issues = spec.issues ?? [];
  return analyze(
    {
      repo: youngRepo(spec.months, issues.length, now),
      commits: spec.commits,
      releases: spec.releases ?? [],
      issues,
      readme: spec.readme ?? MID_README,
      flags: {},
      fetchedAt: now.toISOString(),
    },
    { now },
  );
}
