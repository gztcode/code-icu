/**
 * Code ICU · GitHub 数据层
 *
 * 职责边界：只负责「解析输入 → 并行取数 → 裁剪 → 缓存」，不含任何评分逻辑。
 * 本文件不 import metrics.js，metrics.js 也不 import 本文件（SPEC §4 解耦要求）。
 *
 * 固定 5 个端点，单次体检请求预算 5（硬约束）。
 * 全项目禁用 GitHub 的 stats 系端点（contributors / participation）：它们由后台异步计算，
 * 未就绪时返回 202 空 body 并长时间挂起，已实测会拖死整个体检。作者分布一律由 commits 自行聚合。
 * @module github
 */

import { clearCache, readCache, writeCache } from './cache.js';
import { COMMIT_WINDOW_DAYS, FETCH_STEPS, PER_PAGE_COMMITS, PER_PAGE_ISSUES, PER_PAGE_RELEASES } from './config.js';
import {
  NetworkError,
  NotFoundError,
  RateLimitError,
  RAW_ACCEPT,
  TokenInvalidError,
  getJson,
  settle,
  trimCommits,
  trimIssues,
  trimReleases,
  trimRepo,
} from './http.js';

export { NetworkError, NotFoundError, RateLimitError, TokenInvalidError };
export { clearCache, readCache, writeCache };

const DAY_MS = 86400000;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * 把用户输入解析成 `{owner, repo}`。
 * 支持：`owner/repo`、`https://github.com/owner/repo`、`owner/repo.git`、末尾斜杠、
 * `www.` 前缀、`git@github.com:owner/repo.git`、`?tab=xxx` 查询串。
 * @param {string} input
 * @returns {{owner: string, repo: string}|null} 无法解析时返回 null，调用方据此提示 AC-02 错误且不发请求
 */
export function parseRepoInput(input) {
  if (typeof input !== 'string') return null;
  let text = input.trim().split(/[?#]/)[0].trim();
  if (!text) return null;
  text = text
    .replace(/^git@github\.com:/i, '')
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^(www\.)?github\.com\//i, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  const parts = text.split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) return null;
  return { owner, repo };
}

/**
 * 单个端点的结果摘要，只用于体检中视图的那一列读数（"96 次"、"10,372 字"）。
 * @param {string} key 步骤 key
 * @param {any} value 端点原始返回值
 * @param {boolean} ok
 * @returns {string}
 */
function summarize(key, value, ok) {
  if (!ok) return '失败';
  if (key === 'repo') return value?.full_name ?? '—';
  if (key === 'commits') return Array.isArray(value) ? `${value.length} 次` : '—';
  if (key === 'releases') return Array.isArray(value) && value.length ? `${value.length} 个版本` : '无版本';
  if (key === 'issues') return Array.isArray(value) ? `${value.length} 条` : '—';
  if (key === 'readme') return typeof value === 'string' ? `${value.length} 字` : '无 README';
  return '—';
}

/**
 * 跑一个端点并把真实耗时、真实结果摘要回调给调用方（体检中的分步进度靠它推进）。
 * 回调抛异常绝不能影响取数，所以整段包 try/catch。
 * @param {string} key
 * @param {Promise<any>} promise
 * @param {(step: {key: string, ok: boolean, ms: number, summary: string, error: Error|null}) => void} [onStep]
 * @returns {Promise<{ok: true, value: any}|{ok: false, error: Error}>}
 */
async function runStep(key, promise, onStep) {
  const startedAt = Date.now();
  const result = await settle(promise);
  if (typeof onStep === 'function') {
    try {
      onStep({
        key,
        ok: result.ok,
        ms: Date.now() - startedAt,
        summary: summarize(key, result.ok ? result.value : null, result.ok),
        error: result.ok ? null : result.error,
      });
    } catch {
      /* UI 回调出错不影响取数 */
    }
  }
  return result;
}

/**
 * 并行拉取单个仓库的 5 个端点，返回归一化数据包。
 *
 * 失败语义：
 * - 仓库档案（端点 1）失败 → 直接抛出：六项体征全部依赖它，无法降级；
 * - `RateLimitError` / `TokenInvalidError` → 直接抛出：这是 IP 级 / 账号级问题，重试无意义，交错误态视图；
 * - 其余单端点失败 → 字段置 null 并写入 `flags`，由指标层把对应体征判为弃权；
 * - `readme` 的 404 不算失败：`readme === null` 表示仓库确实没有 README（`flags.readmeFailed` 才代表取数失败）。
 *
 * 5 个请求是**并行**发出的（一次体检 5 个请求是硬预算）；`onStep` 在每个端点真实返回时回调一次，
 * 顺序即真实完成顺序，不做任何人为排期。
 *
 * @param {{owner: string, repo: string, token?: string, force?: boolean, now?: Date,
 *   onStep?: (step: {key: string, ok: boolean, ms: number, summary: string, error: Error|null}) => void}} params
 * @returns {Promise<{
 *   owner: string, repo: string, fetchedAt: string, fromCache: boolean, cacheAgeMs: number,
 *   repo: object, commits: any[]|null, releases: any[]|null, issues: any[]|null, readme: string|null,
 *   flags: {commitsFailed: boolean, releasesFailed: boolean, issuesFailed: boolean,
 *           readmeFailed: boolean, commitsCapped: boolean}
 * }>}
 */
export async function fetchBundle({ owner, repo, token = '', force = false, now = new Date(), onStep }) {
  const slug = `${owner}/${repo}`;

  if (!force) {
    const hit = readCache(slug);
    if (hit) return { ...hit.bundle, fromCache: true, cacheAgeMs: hit.ageMs };
  }

  const sinceIso = new Date(now.getTime() - COMMIT_WINDOW_DAYS * DAY_MS).toISOString();
  const base = `/repos/${owner}/${repo}`;

  /** @type {Record<string, () => Promise<any>>} */
  const requests = {
    repo: () => getJson(base, { token }),
    commits: () => getJson(`${base}/commits?since=${encodeURIComponent(sinceIso)}&per_page=${PER_PAGE_COMMITS}`, { token }),
    releases: () => getJson(`${base}/releases?per_page=${PER_PAGE_RELEASES}`, { token }),
    issues: () => getJson(`${base}/issues?state=open&per_page=${PER_PAGE_ISSUES}&sort=updated&direction=desc`, { token }),
    readme: () => getJson(`${base}/readme`, { token, accept: RAW_ACCEPT, allow404: true }),
  };

  const [repoRes, commitsRes, releasesRes, issuesRes, readmeRes] = await Promise.all(
    FETCH_STEPS.map((step) => runStep(step.key, requests[step.key](), onStep)),
  );

  if (!repoRes.ok) throw repoRes.error;
  for (const result of [commitsRes, releasesRes, issuesRes, readmeRes]) {
    if (!result.ok && (result.error instanceof RateLimitError || result.error instanceof TokenInvalidError)) {
      throw result.error;
    }
  }

  const commits = commitsRes.ok && Array.isArray(commitsRes.value) ? trimCommits(commitsRes.value) : null;
  const releases = releasesRes.ok && Array.isArray(releasesRes.value) ? trimReleases(releasesRes.value) : null;
  const issues = issuesRes.ok && Array.isArray(issuesRes.value) ? trimIssues(issuesRes.value) : null;
  const readme = readmeRes.ok && typeof readmeRes.value === 'string' ? readmeRes.value : null;

  const bundle = {
    owner,
    repo,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    cacheAgeMs: 0,
    repo: trimRepo(repoRes.value),
    commits,
    releases,
    issues,
    readme,
    flags: {
      commitsFailed: commits === null,
      releasesFailed: releases === null,
      issuesFailed: issues === null,
      readmeFailed: !readmeRes.ok,
      commitsCapped: commits !== null && commits.length >= PER_PAGE_COMMITS,
    },
  };

  writeCache(slug, bundle);
  return bundle;
}

/**
 * 带缓存的快捷入口：命中缓存时不发任何请求（AC-15）。
 * @param {string} slug `owner/repo`
 * @param {{token?: string, now?: Date}} [options]
 * @returns {Promise<object>} 同 fetchBundle
 * @throws {Error} 输入非法时抛 `Error`（调用方应在调用前用 parseRepoInput 拦截）
 */
export async function fetchBySlug(slug, options = {}) {
  const parsed = parseRepoInput(slug);
  if (!parsed) throw new Error(`无法解析仓库地址：${slug}`);
  return fetchBundle({ ...parsed, ...options });
}
